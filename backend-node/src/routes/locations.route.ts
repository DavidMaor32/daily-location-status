import { Router } from "express";
import { createLocationsController } from "../controllers/locations.controller";
import { asyncRoute } from "./async-route";

export default function createLocationsRoute(
  controller: ReturnType<typeof createLocationsController>
) {
  const router = Router();

  router.get(
    "/",
    asyncRoute(async (req, res) => {
      await controller.getLocations(req, res);
    })
  );

  router.post(
    "/",
    asyncRoute(async (req, res) => {
      await controller.addLocation(req, res);
    })
  );

  router.delete(
    "/:location_name",
    asyncRoute(async (req, res) => {
      await controller.deleteLocation(req, res);
    })
  );

  return router;
}
