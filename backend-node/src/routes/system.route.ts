import { Router } from "express";
import { createSystemController } from "../controllers/system.controller";
import { asyncRoute } from "./async-route";

export default function createSystemRoute(controller: ReturnType<typeof createSystemController>) {
  const router = Router();

  router.get(
    "/health",
    asyncRoute(async (req, res) => {
      await controller.getApiHealth(req, res);
    })
  );

  router.get(
    "/status",
    asyncRoute(async (req, res) => {
      await controller.getSystemStatus(req, res);
    })
  );

  return router;
}
