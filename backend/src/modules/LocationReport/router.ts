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
  
  // 1. Decorate report and export handlers
  const reportHandlers = createDecoratedLocationReportHandlers(dal);

  // 2. Define standard routes (Merged dev /export here)
  router.get("/", reportHandlers.getReportsHandler);
  router.get("/export", reportHandlers.exportReportsHandler);
  router.get("/:id", reportHandlers.getReportByIdHandler);
  router.post("/", reportHandlers.addReportHandler);

  // 3. Define backup routes
  if (backupService) {
    const backupHandlers = createDecoratedBackupHandlers(backupService);
    
    router.post("/backup", backupHandlers.manualBackupHandler);
    router.get("/backup/list", backupHandlers.getBackupListHandler);
    router.get("/backup/download/:file", backupHandlers.downloadBackupHandler);
  }

  return router;
};

// Helper for Report Logging
export const createDecoratedLocationReportHandlers = (dal: LocationReportDal) => ({
  getReportsHandler: httpLogger(handlers.getReportsHandler(dal), "getReportsHandler"),
  exportReportsHandler: httpLogger(handlers.exportReportsHandler(dal), "exportReportsHandler"),
  getReportByIdHandler: httpLogger(handlers.getReportByIdHandler(dal), "getReportByIdHandler"),
  addReportHandler: httpLogger(handlers.addReportHandler(dal), "addReportHandler"),
});

// Helper for Backup Logging
export const createDecoratedBackupHandlers = (backupService: BackupService) => ({
  manualBackupHandler: httpLogger(handlers.manualBackupHandler(backupService), "manualBackupHandler"),
  getBackupListHandler: httpLogger(handlers.getBackupListHandler(), "getBackupListHandler"),
  downloadBackupHandler: httpLogger(handlers.downloadBackupHandler(), "backupDownloadHandler"),
});
