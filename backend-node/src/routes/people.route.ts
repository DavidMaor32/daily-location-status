import { Router } from "express";
import { createPeopleController } from "../controllers/people.controller";
import { asyncRoute } from "./async-route";

export default function createPeopleRoute(controller: ReturnType<typeof createPeopleController>) {
  const router = Router();

  router.post(
    "/",
    asyncRoute(async (req, res) => {
      await controller.addPerson(req, res);
    })
  );

  router.post(
    "/initialize-list",
    asyncRoute(async (req, res) => {
      await controller.initializePeople(req, res);
    })
  );

  router.patch(
    "/:person_id",
    asyncRoute(async (req, res) => {
      await controller.updatePerson(req, res);
    })
  );

  router.put(
    "/:person_id",
    asyncRoute(async (req, res) => {
      await controller.replacePerson(req, res);
    })
  );

  router.delete(
    "/:person_id",
    asyncRoute(async (req, res) => {
      await controller.deletePerson(req, res);
    })
  );

  router.get(
    "/:person_id/location-events",
    asyncRoute(async (req, res) => {
      await controller.getPersonLocationEvents(req, res);
    })
  );

  router.get(
    "/:person_id/transitions",
    asyncRoute(async (req, res) => {
      await controller.getPersonTransitions(req, res);
    })
  );

  router.post(
    "/:person_id/location-events",
    asyncRoute(async (req, res) => {
      await controller.addPersonLocationEvent(req, res);
    })
  );

  router.delete(
    "/:person_id/location-events/:event_id",
    asyncRoute(async (req, res) => {
      await controller.deletePersonLocationEvent(req, res);
    })
  );

  return router;
}
