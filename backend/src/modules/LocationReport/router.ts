import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { LocationReportDal } from "./dal";
import * as handlers from "./handlers";
import { httpLogger } from "../../utils/decorators";
import { BackupService } from "../../services/backup";

const BACKUP_DIR = "/app/backups";

export const createLocationReportRouter = (
  dal: LocationReportDal,
  backupService: BackupService | null
) => {
  const router = Router();
  const decoratedHandlers = createDecoratedLocationReportHandlers(dal);

  router.get("/", decoratedHandlers.getReportsHandler);
  router.get("/:id", decoratedHandlers.getReportByIdHandler);
  router.post("/", decoratedHandlers.addReportHandler);

  if (backupService) {
    // Manual backup (already exists)
    router.post(
      "/backup",
      httpLogger(async (_req, res) => {
        await backupService.runBackup();
        res.json({
          success: true,
          message: "Backup created",
        });
      }, "manualBackupHandler")
    );

    // NEW — list files
    router.get(
      "/backup/list",
      httpLogger(async (_req, res) => {
        if (!fs.existsSync(BACKUP_DIR)) {
          return res.json([]);
        }

        const files = fs
          .readdirSync(BACKUP_DIR)
          .filter((f) => f.endsWith(".xlsx"))
          .sort()
          .reverse();

        res.json(files);
      }, "backupListHandler")
    );

    // NEW — download file
    router.get(
      "/backup/download/:file",
      httpLogger(async (req, res) => {
        const fileName = req.params.file;

        // SECURITY
        if (!fileName || fileName.includes("/") || fileName.includes("..")) {
          return res.status(400).json({ error: "Invalid filename" });
        }

        const filePath = path.join(BACKUP_DIR, fileName);

        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: "File not found" });
        }

        res.download(filePath);
      }, "backupDownloadHandler")
    );
  }

  return router;
};

export const createDecoratedLocationReportHandlers = (
  dal: LocationReportDal
) => ({
  getReportsHandler: httpLogger(
    handlers.getReportsHandler(dal),
    "getReportsHandler"
  ),
  getReportByIdHandler: httpLogger(
    handlers.getReportByIdHandler(dal),
    "getReportByIdHandler"
  ),
  addReportHandler: httpLogger(
    handlers.addReportHandler(dal),
    "addReportHandler"
  ),
});
