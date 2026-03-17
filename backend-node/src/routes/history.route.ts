import { Router } from "express";
import { createHistoryController } from "../controllers/history.controller";
import { asyncRoute } from "./async-route";

export default function createHistoryRoute(controller: ReturnType<typeof createHistoryController>) {
  const router = Router();

  router.get(
    "/dates",
    asyncRoute(async (req, res) => {
      await controller.getHistoryDates(req, res);
    })
  );

  router.post(
    "/:snapshot_date/restore-to-today",
    asyncRoute(async (req, res) => {
      await controller.restoreHistoryDateToToday(req, res);
    })
  );

  return router;
}
