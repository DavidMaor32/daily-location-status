import express from "express";
import cors from "cors";
import { NextFunction, Request, Response } from "express";

import { loadConfig } from "./config";
import { JsonStorage } from "./storage/storage";
import { ExcelStorage } from "./storage/excelStorage";
import { S3ExcelStorage } from "./storage/s3ExcelStorage";
import { MirroredStorage } from "./storage/mirroredStorage";
import { SnapshotService } from "./service/service";
import { TelegramBotService } from "./service/telegramBotService";
import healthRoute from "./routes/health.route";
import createSnapshotRoute from "./routes/snapshot.route";
import { createSnapshotController } from "./controllers/snapshot.controller";
import createSystemRoute from "./routes/system.route";
import { createSystemController } from "./controllers/system.controller";
import createHistoryRoute from "./routes/history.route";
import { createHistoryController } from "./controllers/history.controller";
import createLocationsRoute from "./routes/locations.route";
import { createLocationsController } from "./controllers/locations.controller";
import createPeopleRoute from "./routes/people.route";
import { createPeopleController } from "./controllers/people.controller";
import createSelfReportRoute from "./routes/self-report.route";
import { createSelfReportController } from "./controllers/self-report.controller";
import createExportRoute from "./routes/export.route";
import { createExportController } from "./controllers/export.controller";

const config = loadConfig();
const app = express();
const storage = buildStorage(config);
const service = new SnapshotService(storage);
const telegramService = new TelegramBotService(config, service);
const snapshotController = createSnapshotController({ service });
const systemController = createSystemController({ telegramService });
const historyController = createHistoryController({ service });
const locationsController = createLocationsController({ service });
const peopleController = createPeopleController({ service });
const selfReportController = createSelfReportController({ service });
const exportController = createExportController({ service });

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/api/health", healthRoute);
app.use("/api/snapshot", createSnapshotRoute(snapshotController));
app.use("/api/system", createSystemRoute(systemController));
app.use("/api/history", createHistoryRoute(historyController));
app.use("/api/locations", createLocationsRoute(locationsController));
app.use("/api/people", createPeopleRoute(peopleController));
app.use("/api/self-report", createSelfReportRoute(selfReportController));
app.use("/api/export", createExportRoute(exportController));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    "message" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number" &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    const appError = err as { statusCode: number; message: string };
    res.status(appError.statusCode).json({ detail: appError.message });
    return;
  }
  // Keep error body stable for frontend user messages.
  res.status(500).json({ detail: "Internal server error" });
});

service
  .initializeTodaySnapshot()
  .then(() => {
    telegramService.start();
    app.listen(config.port, "0.0.0.0", () => {
      process.stdout.write(
        `Node backend started on http://localhost:${config.port} (storage-mode: ${config.storageMode}, storage-backend: ${config.storageBackend}, storage: ${config.storageDir})\n`
      );
    });
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to initialize backend-node: ${message}\n`);
    process.exit(1);
  });

function buildStorage(runtimeConfig: any) {
  if (runtimeConfig.storageBackend === "json") {
    return new JsonStorage(runtimeConfig.storageDir);
  }

  const normalizedMode = String(runtimeConfig.storageMode || "local").toLowerCase();
  if (normalizedMode === "s3") {
    return new S3ExcelStorage(runtimeConfig);
  }
  if (["local_and_s3", "dual", "hybrid"].includes(normalizedMode)) {
    const local = new ExcelStorage(runtimeConfig.storageDir);
    const s3 = new S3ExcelStorage(runtimeConfig);
    return new MirroredStorage(local, s3);
  }
  return new ExcelStorage(runtimeConfig.storageDir);
}

process.on("SIGINT", () => {
  telegramService.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  telegramService.stop();
  process.exit(0);
});

