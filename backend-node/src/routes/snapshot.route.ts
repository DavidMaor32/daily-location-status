import { Router } from "express";
import { createSnapshotController } from "../controllers/snapshot.controller";
import { asyncRoute } from "./async-route";

export default function createSnapshotRoute(
  controller: ReturnType<typeof createSnapshotController>
) {
  const router = Router();

  router.get(
    "/today",
    asyncRoute(async (req, res) => {
      await controller.getSnapshotToday(req, res);
    })
  );

  router.get(
    "/:snapshot_date",
    asyncRoute(async (req, res) => {
      await controller.getSnapshotByDate(req, res);
    })
  );

  router.post(
    "/:snapshot_date/save",
    asyncRoute(async (req, res) => {
      await controller.saveSnapshotByDate(req, res);
    })
  );

  router.delete(
    "/:snapshot_date",
    asyncRoute(async (req, res) => {
      await controller.deleteSnapshotByDate(req, res);
    })
  );

  return router;
}
