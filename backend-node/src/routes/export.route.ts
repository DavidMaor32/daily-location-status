import { Router } from "express";
import { createExportController } from "../controllers/export.controller";
import { asyncRoute } from "./async-route";

export default function createExportRoute(controller: ReturnType<typeof createExportController>) {
  const router = Router();

  router.get(
    "/day/:snapshot_date",
    asyncRoute(async (req, res) => {
      await controller.exportSnapshotDay(req, res);
    })
  );

  router.get(
    "/range",
    asyncRoute(async (req, res) => {
      await controller.exportSnapshotRange(req, res);
    })
  );

  return router;
}
