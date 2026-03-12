from __future__ import annotations

import json
import logging
import threading
from collections import Counter
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import Settings
from app.exceptions import AppError, NotFoundError, ValidationError
from app.models import PersonCreate
from app.services.snapshot_service import SnapshotService
from app.utils.file_lock import ProcessFileLock


logger = logging.getLogger(__name__)

STATE_WAITING_NAME = "waiting_name"
STATE_WAITING_LOCATION = "waiting_location"
STATE_WAITING_STATUS = "waiting_status"
STATUS_OPTIONS = ("תקין", "לא תקין")
RESTART_HINT = "אפשר לנסות שוב באותו שלב, או לשלוח /start להתחלה מחדש."


class TelegramBotService:
    """Telegram long-polling worker with conversational self-report flow."""

    def __init__(self, settings: Settings, snapshot_service: SnapshotService) -> None:
        """Store runtime settings, shared snapshot service, and worker state."""
        self.settings = settings
        self.snapshot_service = snapshot_service
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._state_lock = threading.Lock()
        self._conversation_lock = threading.Lock()
        self._offset = 0
        self._bot_token = (settings.telegram_bot_token or "").strip()
        self._allowed_chat_ids = set(settings.telegram_allowed_chat_ids)
        # Keep both ordered display names and normalized lookup keys for whitelist mode.
        raw_allowed_names = [
            name.strip() for name in settings.telegram_allowed_remote_names if name.strip()
        ]
        self._allowed_remote_names: list[str] = []
        self._allowed_remote_name_keys: set[str] = set()
        for name in raw_allowed_names:
            normalized_name = self._normalize_key(name)
            if normalized_name in self._allowed_remote_name_keys:
                continue
            self._allowed_remote_names.append(name)
            self._allowed_remote_name_keys.add(normalized_name)
        # Ensure only one polling worker per machine/process group.
        lock_path = self.settings.local_storage_dir / ".locks" / "telegram_bot.lock"
        self._poller_lock = ProcessFileLock(lock_path)
        self._owns_poller_lock = False
        self._healthy = False
        self._last_error: str | None = None
        self._conversation_by_chat: dict[int, dict] = {}

    def start(self) -> None:
        """Start background polling thread if Telegram integration is enabled."""
        if not self.settings.telegram_bot_enabled:
            self._set_health(False, None)
            logger.info("Telegram bot service is disabled by configuration")
            return

        if not self._bot_token:
            self._set_health(False, "TELEGRAM_BOT_TOKEN is missing")
            logger.warning("Telegram bot is enabled but TELEGRAM_BOT_TOKEN is missing")
            return
        if self._thread and self._thread.is_alive():
            return
        if not self._acquire_singleton_poller_lock():
            return

        self._stop_event.clear()
        self._set_health(True, None)
        self._thread = threading.Thread(
            target=self._run_poll_loop,
            daemon=True,
            name="telegram-bot-poller",
        )
        try:
            self._thread.start()
            logger.info("Telegram bot polling started")
        except Exception:
            self._release_singleton_poller_lock()
            raise

    def stop(self) -> None:
        """Stop polling thread gracefully during application shutdown."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.settings.telegram_poll_timeout_seconds + 2)
        self._thread = None
        self._release_singleton_poller_lock()
        self._set_health(False, self._last_error)
        logger.info("Telegram bot polling stopped")

    def _is_enabled(self) -> bool:
        """Return True only if feature flag and bot token are configured."""
        return self.settings.telegram_bot_enabled and bool(self._bot_token)

    def get_runtime_status(self) -> dict:
        """Return runtime status used by frontend to decide auto-refresh behavior."""
        with self._state_lock:
            running = bool(self._thread and self._thread.is_alive())
            healthy = bool(self._healthy)
            last_error = self._last_error

        configured = bool(self._bot_token)
        enabled = self.settings.telegram_bot_enabled
        active = enabled and configured and running and healthy
        message = self._build_status_message(
            enabled=enabled,
            configured=configured,
            running=running,
            healthy=healthy,
            last_error=last_error,
        )
        return {
            "telegram_enabled": enabled,
            "telegram_configured": configured,
            "telegram_running": running,
            "telegram_healthy": healthy,
            "telegram_active": active,
            "telegram_message": message,
            "telegram_last_error": last_error,
        }

    def _run_poll_loop(self) -> None:
        """Main worker loop: receive Telegram updates and process message commands."""
        try:
            while not self._stop_event.is_set():
                try:
                    updates = self._poll_updates()
                    self._set_health(True, None)
                    for update in updates:
                        self._offset = max(self._offset, int(update.get("update_id", 0)) + 1)
                        self._handle_update(update)
                except Exception as exc:  # noqa: BLE001
                    error_text = str(exc)
                    self._set_health(False, error_text)
                    if self._is_conflict_error(error_text):
                        logger.error(
                            "Telegram polling conflict detected (likely another bot instance is running): %s",
                            exc,
                        )
                        break
                    logger.exception("Telegram polling loop failed: %s", exc)
                    self._stop_event.wait(self.settings.telegram_poll_retry_seconds)
        finally:
            self._release_singleton_poller_lock()

    def _poll_updates(self) -> list[dict]:
        """Fetch pending updates from Telegram API using long polling."""
        payload = {
            "timeout": self.settings.telegram_poll_timeout_seconds,
            "offset": self._offset,
            "allowed_updates": ["message"],
        }
        response = self._api_post("getUpdates", payload)
        if not response.get("ok"):
            raise RuntimeError(f"Telegram getUpdates failed: {response}")
        return response.get("result", [])

    def _handle_update(self, update: dict) -> None:
        """Handle one Telegram update object (text commands + guided conversation)."""
        message = update.get("message") or {}
        text = str(message.get("text") or "").strip()
        if not text:
            return

        chat_id = int((message.get("chat") or {}).get("id", 0))
        if chat_id == 0:
            return

        if self._allowed_chat_ids and chat_id not in self._allowed_chat_ids:
            self._send_message(chat_id, "הצ'אט הזה לא מורשה לעדכן סטטוס.")
            return

        if self._handle_command(chat_id, text):
            return

        conversation = self._get_conversation(chat_id)
        if conversation:
            self._continue_conversation(chat_id, text, conversation)
            return

        # If message starts with "/" and wasn't matched as a known command, do not treat it as status payload.
        if text.startswith("/"):
            self._send_message(chat_id, "פקודה לא מוכרת. שלח /help לרשימת פקודות.")
            return

        if "|" in text:
            self._handle_direct_status_update(chat_id, text)
            return

        self._send_message(chat_id, "כדי להתחיל הזנה שלח /start")

    def _handle_command(self, chat_id: int, text: str) -> bool:
        """Handle known bot commands. Returns True when command was handled."""
        if self._is_command(text, "/cancel"):
            self._clear_conversation(chat_id)
            self._send_message(
                chat_id,
                "תהליך ההזנה בוטל. להתחלה מחדש שלח /start",
                reply_markup=self._remove_keyboard_markup(),
            )
            return True

        if self._is_command(text, "/start"):
            self._start_conversation(chat_id)
            return True

        if self._is_command(text, "/help"):
            self._send_message(chat_id, self._help_text())
            return True

        if self._is_command(text, "/locations"):
            locations = self.snapshot_service.get_locations()
            self._send_message(chat_id, "מיקומים זמינים:\n" + "\n".join(f"- {item}" for item in locations))
            return True

        if self._is_command(text, "/chatid"):
            self._send_message(chat_id, f"chat_id שלך: {chat_id}")
            return True

        if self._is_command(text, "/status"):
            payload_text = text[len("/status") :].strip()
            if payload_text:
                self._handle_direct_status_update(chat_id, payload_text)
            else:
                self._start_conversation(chat_id)
            return True

        return False

    def _start_conversation(self, chat_id: int) -> None:
        """Start guided 3-step flow: name -> location -> status."""
        try:
            person_options = self._build_person_options_for_remote_input()
        except AppError as exc:
            self._send_message(chat_id, f"ההזנה לא נקלטה בהצלחה: {exc}")
            return

        # When whitelist is configured, at least one allowed person must be available.
        if self._allowed_remote_name_keys and not person_options:
            self._send_message(
                chat_id,
                "אין כרגע שמות זמינים להזנה מרחוק.",
                reply_markup=self._remove_keyboard_markup(),
            )
            return

        self._set_conversation(
            chat_id,
            {
                "state": STATE_WAITING_NAME,
                "person_options": person_options,
            },
        )
        self._prompt_name_step(chat_id, person_options)

    def _prompt_name_step(self, chat_id: int, person_options: list[dict]) -> None:
        """Send prompt for name step, with behavior based on whitelist mode."""
        if self._allowed_remote_name_keys:
            self._send_message(
                chat_id,
                "שלב 1/3: מה השם של הבן אדם?",
                reply_markup=self._remove_keyboard_markup(),
            )
            return

        keyboard = self._remove_keyboard_markup()
        self._send_message(
            chat_id,
            "שלב 1/3: מה השם של הבן אדם? (אפשר להקליד כל שם מלא)",
            reply_markup=keyboard,
        )

    def _prompt_location_step(self, chat_id: int, locations: list[str]) -> None:
        """Send prompt for location step."""
        location_lines = "\n".join(f"- {item}" for item in locations)
        self._send_message(
            chat_id,
            "שלב 2/3: מה המיקום מתוך רשימת המיקומים?\n"
            f"רשימת מיקומים אפשריים:\n{location_lines}",
            reply_markup=self._build_keyboard(locations),
        )

    def _prompt_status_step(self, chat_id: int) -> None:
        """Send prompt for daily status step."""
        self._send_message(
            chat_id,
            "שלב 3/3: מה סטטוס ההזנה? תקין או לא תקין",
            reply_markup=self._build_keyboard(list(STATUS_OPTIONS), row_size=2),
        )

    def _continue_conversation(self, chat_id: int, text: str, conversation: dict) -> None:
        """Continue guided conversation according to current chat state."""
        state = conversation.get("state")

        if state == STATE_WAITING_NAME:
            self._handle_waiting_name(chat_id, text, conversation)
            return

        if state == STATE_WAITING_LOCATION:
            self._handle_waiting_location(chat_id, text, conversation)
            return

        if state == STATE_WAITING_STATUS:
            self._handle_waiting_status(chat_id, text, conversation)
            return

        self._clear_conversation(chat_id)
        self._send_message(chat_id, "מצב שיחה לא תקין. שלח /start להתחלה מחדש.")

    def _handle_waiting_name(self, chat_id: int, text: str, conversation: dict) -> None:
        """Validate selected person name and move flow to location step."""
        person_options = conversation.get("person_options", [])
        selected = self._match_person_option(text, person_options)
        if not selected:
            if self._allowed_remote_name_keys:
                self._send_step_validation_error(
                    chat_id,
                    "השם לא נמצא ברשימה המורשית. בחר/י שם מהרשימה.",
                    reply_markup=self._remove_keyboard_markup(),
                )
                return

            typed_name = text.strip()
            if len(typed_name) < 2:
                self._send_step_validation_error(
                    chat_id,
                    "יש להקליד שם מלא (לפחות 2 תווים).",
                    reply_markup=self._remove_keyboard_markup(),
                )
                return

            selected = {
                "label": typed_name,
                "full_name": typed_name,
                # In open mode, lookup starts with full_name; if missing, we auto-register later.
                "person_lookup": typed_name,
            }

        locations = self.snapshot_service.get_locations()
        if not locations:
            self._send_step_validation_error(
                chat_id,
                "לא נמצאו מיקומים זמינים במערכת.",
                reply_markup=self._remove_keyboard_markup(),
            )
            return

        self._set_conversation(
            chat_id,
            {
                "state": STATE_WAITING_LOCATION,
                "person_lookup": selected["person_lookup"],
                "person_name": selected["full_name"],
                "locations": locations,
            },
        )
        self._prompt_location_step(chat_id, locations)

    def _handle_waiting_location(self, chat_id: int, text: str, conversation: dict) -> None:
        """Validate location and move flow to status step."""
        locations = [str(item).strip() for item in conversation.get("locations", []) if str(item).strip()]
        selected_location = self._match_text_option(text, locations)
        if not selected_location:
            self._send_step_validation_error(
                chat_id,
                "המיקום לא נמצא ברשימת המיקומים. בחר/י מיקום מהרשימה.",
                reply_markup=self._build_keyboard(locations),
            )
            return

        self._set_conversation(
            chat_id,
            {
                "state": STATE_WAITING_STATUS,
                "person_lookup": conversation.get("person_lookup"),
                "person_name": conversation.get("person_name"),
                "selected_location": selected_location,
            },
        )
        self._prompt_status_step(chat_id)

    def _handle_waiting_status(self, chat_id: int, text: str, conversation: dict) -> None:
        """Validate status and persist final self-report update."""
        selected_status = self._match_text_option(text, list(STATUS_OPTIONS))
        if not selected_status:
            self._send_step_validation_error(
                chat_id,
                "הסטטוס חייב להיות: תקין או לא תקין.",
                reply_markup=self._build_keyboard(list(STATUS_OPTIONS), row_size=2),
            )
            return

        person_lookup = str(conversation.get("person_lookup") or "").strip()
        person_name = str(conversation.get("person_name") or "").strip()
        selected_location = str(conversation.get("selected_location") or "").strip()

        try:
            updated_person, created_new_person = self._submit_status_update(
                person_lookup=person_lookup,
                person_name=person_name,
                self_location=selected_location,
                self_daily_status=selected_status,
            )
        except NotFoundError:
            # In whitelist mode, selected person can disappear between steps (race/delete).
            self._send_message(
                chat_id,
                "האדם שנבחר לא נמצא כרגע במערכת. חוזרים לשלב בחירת שם.",
                reply_markup=self._remove_keyboard_markup(),
            )
            self._start_conversation(chat_id)
            return
        except AppError as exc:
            self._send_step_validation_error(
                chat_id,
                f"ההזנה לא נקלטה בהצלחה: {exc}",
                reply_markup=self._build_keyboard(list(STATUS_OPTIONS), row_size=2),
            )
            return
        except Exception as exc:  # noqa: BLE001
            logger.exception("Unexpected Telegram conversation error: %s", exc)
            self._send_step_validation_error(
                chat_id,
                "אירעה שגיאה בלתי צפויה. נסה/י שוב.",
                reply_markup=self._build_keyboard(list(STATUS_OPTIONS), row_size=2),
            )
            return

        success_prefix = (
            "ההזנה נקלטה בהצלחה (נוצר אדם חדש במערכת)."
            if created_new_person
            else "ההזנה נקלטה בהצלחה."
        )
        self._send_message(
            chat_id,
            f"{success_prefix}\n"
            f"שם: {person_name or updated_person.get('full_name', '-') }\n"
            f"מיקום: {updated_person.get('self_location') or '-'}\n"
            f"סטטוס: {updated_person.get('self_daily_status') or '-'}",
            reply_markup=self._remove_keyboard_markup(),
        )
        self._clear_conversation(chat_id)

    def _submit_status_update(
        self,
        person_lookup: str,
        person_name: str,
        self_location: str,
        self_daily_status: str,
    ) -> tuple[dict, bool]:
        """
        Apply self-report update.

        Returns tuple: (updated_person_record, created_new_person_flag)
        """
        try:
            updated_person = self.snapshot_service.update_self_report_today(
                person_lookup=person_lookup,
                self_location=self_location,
                self_daily_status=self_daily_status,
            )
            return updated_person, False
        except NotFoundError:
            registration_name = (person_name or person_lookup).strip()
            if len(registration_name) < 2:
                raise ValidationError("שם לא תקין לרישום.")

            # Whitelist mode: allow auto-registration only for explicit allowed names.
            if (
                self._allowed_remote_name_keys
                and self._normalize_key(registration_name) not in self._allowed_remote_name_keys
            ):
                raise ValidationError("השם לא מורשה להזנה מרחוק.")

            # Open mode: any typed name is allowed. Whitelist mode: only configured names are allowed.
            created_person = self.snapshot_service.add_person_today(
                PersonCreate(
                    full_name=registration_name,
                    location=self_location,
                    # New registrations start as \"not entered\" for daily_status.
                    daily_status="לא הוזן",
                    notes="נרשם דרך בוט טלגרם",
                )
            )
            updated_person = self.snapshot_service.update_self_report_today(
                person_lookup=str(created_person["person_id"]),
                self_location=self_location,
                self_daily_status=self_daily_status,
            )
            return updated_person, True

    def _handle_direct_status_update(self, chat_id: int, payload_text: str) -> None:
        """Backward-compatible direct update in format: person|location|status."""
        try:
            person_lookup, self_location, self_daily_status = self._parse_status_payload(payload_text)
            self._ensure_lookup_allowed_for_remote_input(person_lookup)
            updated_person, created_new_person = self._submit_status_update(
                person_lookup=person_lookup,
                person_name=person_lookup,
                self_location=self_location,
                self_daily_status=self_daily_status,
            )
            success_prefix = (
                "ההזנה נקלטה בהצלחה (נוצר אדם חדש במערכת)."
                if created_new_person
                else "ההזנה נקלטה בהצלחה."
            )
            self._send_message(
                chat_id,
                f"{success_prefix}\n"
                f"שם: {updated_person['full_name']}\n"
                f"מיקום: {updated_person.get('self_location') or '-'}\n"
                f"סטטוס: {updated_person.get('self_daily_status') or '-'}",
            )
        except AppError as exc:
            self._send_message(chat_id, f"ההזנה לא נקלטה בהצלחה: {exc}\n{RESTART_HINT}")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Unexpected Telegram command error: %s", exc)
            self._send_message(chat_id, f"ההזנה לא נקלטה בהצלחה עקב שגיאה בלתי צפויה.\n{RESTART_HINT}")

    def _build_person_options_for_remote_input(self) -> list[dict]:
        """Build selectable person list for remote input flow (with optional whitelist)."""
        snapshot_payload = self.snapshot_service.get_today_snapshot()
        people = snapshot_payload.get("people", [])

        # Whitelist mode: show configured names even if the person does not exist yet.
        if self._allowed_remote_name_keys:
            people_by_name_key: dict[str, list[dict]] = {}
            for person in people:
                full_name = str(person.get("full_name") or "").strip()
                person_id = str(person.get("person_id") or "").strip()
                if not full_name:
                    continue
                normalized_name = self._normalize_key(full_name)
                if normalized_name not in self._allowed_remote_name_keys:
                    continue
                people_by_name_key.setdefault(normalized_name, []).append(
                    {"full_name": full_name, "person_id": person_id}
                )

            options: list[dict] = []
            for allowed_name in self._allowed_remote_names:
                allowed_name_key = self._normalize_key(allowed_name)
                matches = sorted(
                    people_by_name_key.get(allowed_name_key, []),
                    key=lambda item: item["person_id"],
                )

                # Existing person rows use person_id lookup. Missing rows stay as name lookup
                # so _submit_status_update can auto-create from the allowed list.
                if matches:
                    duplicated = len(matches) > 1
                    for match in matches:
                        label = (
                            f"{match['full_name']} ({match['person_id']})"
                            if duplicated and match["person_id"]
                            else match["full_name"]
                        )
                        options.append(
                            {
                                "label": label,
                                "full_name": match["full_name"],
                                "person_lookup": match["person_id"] or match["full_name"],
                            }
                        )
                else:
                    options.append(
                        {
                            "label": allowed_name,
                            "full_name": allowed_name,
                            "person_lookup": allowed_name,
                        }
                    )
            return options

        # Open mode: all people from snapshot are selectable.
        candidate_people: list[dict] = []
        for person in people:
            full_name = str(person.get("full_name") or "").strip()
            person_id = str(person.get("person_id") or "").strip()
            if not full_name or not person_id:
                continue
            candidate_people.append({"person_id": person_id, "full_name": full_name})

        if not candidate_people:
            return []

        candidate_people = sorted(candidate_people, key=lambda item: (item["full_name"], item["person_id"]))
        name_counts = Counter(item["full_name"] for item in candidate_people)

        options: list[dict] = []
        for item in candidate_people:
            duplicated_name = name_counts[item["full_name"]] > 1
            label = f"{item['full_name']} ({item['person_id']})" if duplicated_name else item["full_name"]
            options.append(
                {
                    "label": label,
                    "full_name": item["full_name"],
                    "person_lookup": item["person_id"],
                }
            )
        return options

    def _ensure_lookup_allowed_for_remote_input(self, person_lookup: str) -> None:
        """Validate direct lookup against whitelist policy when whitelist is enabled."""
        if not self._allowed_remote_name_keys:
            return

        lookup_key = self._normalize_key(person_lookup)
        if not lookup_key:
            raise ValidationError("person_lookup cannot be empty")

        # If caller sends a whitelisted name directly, allow (even if person is not yet created).
        if lookup_key in self._allowed_remote_name_keys:
            return

        snapshot_payload = self.snapshot_service.get_today_snapshot()
        people = snapshot_payload.get("people", [])

        for person in people:
            full_name = str(person.get("full_name") or "").strip()
            person_id = str(person.get("person_id") or "").strip()
            full_name_key = self._normalize_key(full_name)
            if not full_name_key or not person_id:
                continue

            if lookup_key == self._normalize_key(person_id) or lookup_key == full_name_key:
                if full_name_key in self._allowed_remote_name_keys:
                    return
                raise ValidationError("השם לא מורשה להזנה מרחוק.")

        raise ValidationError("השם לא נמצא ברשימה המורשית.")

    def _match_person_option(self, user_input: str, person_options: list[dict]) -> dict | None:
        """Match user text to a person option label (or unique name)."""
        normalized_input = self._normalize_key(user_input)
        if not normalized_input:
            return None

        for option in person_options:
            if self._normalize_key(option["label"]) == normalized_input:
                return option

        by_name_counter = Counter(self._normalize_key(option["full_name"]) for option in person_options)
        unique_name_options = {
            self._normalize_key(option["full_name"]): option
            for option in person_options
            if by_name_counter[self._normalize_key(option["full_name"])] == 1
        }
        return unique_name_options.get(normalized_input)

    def _match_text_option(self, user_input: str, options: list[str]) -> str | None:
        """Case-insensitive match of one user value against fixed options list."""
        normalized_input = self._normalize_key(user_input)
        if not normalized_input:
            return None

        for option in options:
            if self._normalize_key(option) == normalized_input:
                return option
        return None

    def _parse_status_payload(self, payload_text: str) -> tuple[str, str, str]:
        """Parse status message payload in format: person|location|status."""
        parts = [item.strip() for item in payload_text.split("|", 2)]
        if len(parts) != 3 or not all(parts):
            raise ValidationError(
                "Invalid message format. Expected: person_id_or_name|location|תקין/לא תקין"
            )
        return parts[0], parts[1], parts[2]

    def _help_text(self) -> str:
        """Return user help message with supported commands and conversation flow."""
        return (
            "פקודות זמינות:\n"
            "/start - התחלת הזנה מודרכת (שם -> מיקום -> סטטוס)\n"
            "/cancel - ביטול הזנה נוכחית\n"
            "/help - עזרה\n"
            "/locations - רשימת מיקומים\n"
            "/chatid - הצגת chat id\n\n"
            "אפשר גם הזנה ישירה:\n"
            "/status person_id_או_שם_מלא | מיקום | תקין/לא תקין"
        )

    def _send_step_validation_error(self, chat_id: int, message: str, reply_markup: dict) -> None:
        """Send validation error while keeping current step active."""
        self._send_message(
            chat_id,
            f"{message}\n{RESTART_HINT}",
            reply_markup=reply_markup,
        )

    def _send_message(self, chat_id: int, text: str, reply_markup: dict | None = None) -> None:
        """Send one text message to Telegram chat (optionally with keyboard markup)."""
        payload: dict = {
            "chat_id": chat_id,
            "text": text,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        self._api_post("sendMessage", payload)

    def _api_post(self, method_name: str, payload: dict) -> dict:
        """Call Telegram Bot HTTP API with JSON payload and parse JSON response."""
        if not self._is_enabled():
            raise RuntimeError("Telegram bot is disabled")

        url = f"https://api.telegram.org/bot{self._bot_token}/{method_name}"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = Request(
            url=url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        timeout = max(10, self.settings.telegram_poll_timeout_seconds + 5)
        try:
            with urlopen(request, timeout=timeout) as response:  # noqa: S310
                raw = response.read().decode("utf-8")
                return json.loads(raw)
        except HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8")
            except Exception:  # noqa: BLE001
                body = ""
            raise RuntimeError(
                f"Telegram API request failed ({method_name}, code={exc.code}): {body}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(f"Telegram API request failed ({method_name})") from exc

    def _set_health(self, healthy: bool, last_error: str | None) -> None:
        """Update internal health status from polling thread."""
        with self._state_lock:
            self._healthy = healthy
            self._last_error = last_error

    def _build_status_message(
        self,
        enabled: bool,
        configured: bool,
        running: bool,
        healthy: bool,
        last_error: str | None,
    ) -> str:
        """Build one short human-readable status message for UI."""
        if not enabled:
            return "בוט טלגרם לא פעיל"
        if not configured:
            return "בוט טלגרם לא פעיל (חסר token)"
        if not running:
            return "בוט טלגרם לא פעיל"
        if not healthy:
            return "בוט טלגרם לא פעיל"
        if last_error:
            return "בוט טלגרם פעיל עם שגיאה אחרונה"
        return "בוט טלגרם פעיל"

    def _acquire_singleton_poller_lock(self) -> bool:
        """
        Acquire non-blocking process lock for Telegram poller.

        This prevents multiple backend workers on the same machine from
        polling Telegram with the same token at the same time.
        """
        if self._owns_poller_lock:
            return True

        acquired = self._poller_lock.acquire(blocking=False)
        if not acquired:
            message = "Telegram poller is already running in another process"
            self._set_health(False, message)
            logger.warning(message)
            return False

        self._owns_poller_lock = True
        return True

    def _release_singleton_poller_lock(self) -> None:
        """Release process lock for Telegram poller when worker stops."""
        if not self._owns_poller_lock:
            return
        self._poller_lock.release()
        self._owns_poller_lock = False

    def _is_conflict_error(self, message: str) -> bool:
        """Detect Telegram conflict errors (HTTP 409) from API failures."""
        normalized = message.lower()
        return "code=409" in normalized or "conflict" in normalized

    def _build_keyboard(self, options: list[str], row_size: int = 2) -> dict:
        """Build Telegram reply keyboard from options list."""
        clean_options = [item.strip() for item in options if item and item.strip()]
        if not clean_options:
            return self._remove_keyboard_markup()

        rows: list[list[str]] = []
        current_row: list[str] = []
        for option in clean_options:
            current_row.append(option)
            if len(current_row) == row_size:
                rows.append(current_row)
                current_row = []
        if current_row:
            rows.append(current_row)

        return {
            "keyboard": rows,
            "resize_keyboard": True,
            "one_time_keyboard": False,
        }

    def _remove_keyboard_markup(self) -> dict:
        """Return Telegram markup to remove custom keyboard from chat."""
        return {"remove_keyboard": True}

    def _set_conversation(self, chat_id: int, conversation_data: dict) -> None:
        """Save/replace one chat conversation state atomically."""
        with self._conversation_lock:
            self._conversation_by_chat[chat_id] = conversation_data

    def _get_conversation(self, chat_id: int) -> dict | None:
        """Fetch current conversation state for one chat."""
        with self._conversation_lock:
            conversation = self._conversation_by_chat.get(chat_id)
            return dict(conversation) if conversation else None

    def _clear_conversation(self, chat_id: int) -> None:
        """Clear conversation state for one chat."""
        with self._conversation_lock:
            self._conversation_by_chat.pop(chat_id, None)

    def _is_command(self, text: str, command: str) -> bool:
        """Return True for exact command or command followed by arguments."""
        return text == command or text.startswith(f"{command} ")

    def _normalize_key(self, value: str) -> str:
        """Normalize text keys for case-insensitive matching."""
        return value.strip().lower()
