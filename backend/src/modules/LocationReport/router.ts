import { Router } from "express";
import { LocationReportDal } from "./dal";
import * as handlers from "./handlers";
import { httpLogger } from "../../utils/decorators";
import { BackupService } from "../../services/backup"; 

export const createLocationReportRouter = (
  dal: LocationReportDal,
  backupService: BackupService
) => {
  const router = Router();
  const decoratedHandlers = createDecoratedLocationReportHandlers(dal);

  router.get("/", decoratedHandlers.getReportsHandler);
  router.get("/:id", decoratedHandlers.getReportByIdHandler);
  router.post("/", decoratedHandlers.addReportHandler);

  router.post(
    "/backup",
    httpLogger(
      async (_req, res) => {
        try {
          await backupService.runBackup();
          res.json({
            success: true,
            message: "Backup created"
          });
        } catch (err) {
          res.status(500).json({
            success: false,
            message: "Backup failed"
          });
        }        
      },
      "manualBackupHandler"
    )
  );

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
