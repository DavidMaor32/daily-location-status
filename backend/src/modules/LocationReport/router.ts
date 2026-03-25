import { Router } from "express";
import { LocationReportDal } from "./dal";
import * as handlers from "./handlers";
import { httpLogger } from "../../utils/decorators";
import { BackupService } from "../../services/backup";

export const createLocationReportRouter = (
  dal: LocationReportDal,
  backupService: BackupService | null
) => {
  const router = Router();
  const decoratedHandlers = createDecoratedLocationReportHandlers(dal);

  router.get("/", decoratedHandlers.getReportsHandler);
  router.get("/export", decoratedHandlers.exportReportsHandler);
  router.get("/:id", decoratedHandlers.getReportByIdHandler);
  router.post("/", decoratedHandlers.addReportHandler);
  router.put("/:id", decoratedHandlers.updateReportHandler);
  router.delete("/:id", decoratedHandlers.deleteReportHandler);

  // Only register backup endpoint when BackupService is running (local env only)
  if (backupService) {
    router.post(
      "/backup",
      httpLogger(
        async (_req, res) => {
          await backupService.runBackup();
          res.json({
            success: true,
            message: "Backup created",
          });
        },
        "manualBackupHandler"
      )
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
  exportReportsHandler: httpLogger(
    handlers.exportReportsHandler(dal),
    "exportReportsHandler"
  ),
  addReportHandler: httpLogger(
    handlers.addReportHandler(dal),
    "addReportHandler"
  ),
  updateReportHandler: httpLogger(
    handlers.updateReportHandler(dal),
    "updateReportHandler"
  ),
  deleteReportHandler: httpLogger(
    handlers.deleteReportHandler(dal),
    "deleteReportHandler"
  ),
});
