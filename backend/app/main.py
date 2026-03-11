from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.dependencies import get_settings, get_snapshot_service
from app.api.routers.export import router as export_router
from app.api.routers.locations import router as locations_router
from app.api.routers.people import router as people_router
from app.api.routers.snapshot import router as snapshot_router
from app.exceptions import AppError, NotFoundError, StorageError, ValidationError
from app.models import SystemStatusResponse
from app.services.telegram_bot_service import TelegramBotService


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
telegram_bot_service: TelegramBotService | None = None


def get_system_status() -> dict:
    """Return backend runtime status payload for UI and operations dashboards."""
    if telegram_bot_service is None:
        settings = get_settings()
        configured = bool((settings.telegram_bot_token or "").strip())
        enabled = settings.telegram_bot_enabled
        if not enabled:
            message = "בוט טלגרם לא פעיל"
        elif not configured:
            message = "בוט טלגרם לא פעיל (חסר token)"
        else:
            message = "בוט טלגרם באתחול"
        return {
            "telegram_enabled": enabled,
            "telegram_configured": configured,
            "telegram_running": False,
            "telegram_healthy": False,
            "telegram_active": False,
            "telegram_message": message,
            "telegram_last_error": None,
        }
    return telegram_bot_service.get_runtime_status()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize today's snapshot during application startup."""
    global telegram_bot_service
    service = get_snapshot_service()
    settings = get_settings()
    logger.info("Using startup config file: %s", settings.config_file_path)
    try:
        service.initialize_today_snapshot()
        logger.info("Today's snapshot initialized successfully")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Startup initialization failed: %s", exc)

    telegram_bot_service = TelegramBotService(settings=settings, snapshot_service=service)
    telegram_bot_service.start()
    try:
        yield
    finally:
        if telegram_bot_service is not None:
            telegram_bot_service.stop()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NotFoundError)
async def not_found_error_handler(_: object, exc: NotFoundError):
    """Return unified 404 response for not found business errors."""
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ValidationError)
async def validation_error_handler(_: object, exc: ValidationError):
    """Return unified 400 response for validation/business errors."""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(StorageError)
async def storage_error_handler(_: object, exc: StorageError):
    """Return unified 500 response for storage backend errors."""
    logger.error("Storage error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Storage operation failed"})


@app.exception_handler(AppError)
async def app_error_handler(_: object, exc: AppError):
    """Return unified fallback response for known application errors."""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled_error_handler(_: object, exc: Exception):
    """
    Catch unexpected server errors and return a safe response.

    This prevents leaking internal details and keeps request failures controlled.
    """
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(snapshot_router)
app.include_router(export_router)
app.include_router(locations_router)
app.include_router(people_router)


@app.get("/api/health")
def health() -> dict:
    """Health-check endpoint used by monitoring and readiness checks."""
    return {"status": "ok"}


@app.get("/api/system/status", response_model=SystemStatusResponse)
def system_status() -> SystemStatusResponse:
    """Return current runtime status for optional integrations."""
    return SystemStatusResponse(**get_system_status())

