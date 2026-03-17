import { Router } from "express";
import { createSelfReportController } from "../controllers/self-report.controller";
import { asyncRoute } from "./async-route";

export default function createSelfReportRoute(
  controller: ReturnType<typeof createSelfReportController>
) {
  const router = Router();

  router.post(
    "/",
    asyncRoute(async (req, res) => {
      await controller.createSelfReport(req, res);
    })
  );

  return router;
}
