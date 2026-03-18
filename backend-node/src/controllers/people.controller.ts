import { Request, Response } from "express";
import { parseDateOrThrow, toIsoDate } from "../utils/utils";

type PeopleServiceLike = {
  addPersonToday: (payload: Record<string, unknown>) => Promise<unknown>;
  addInitialPeopleToday: (names: unknown) => Promise<unknown>;
  updatePersonToday: (personId: string, payload: Record<string, unknown>) => Promise<unknown>;
  replacePersonToday: (personId: string, payload: Record<string, unknown>) => Promise<unknown>;
  deletePersonToday: (personId: string) => Promise<unknown>;
  getPersonLocationEvents: (payload: {
    person_id: string;
    snapshot_date: string;
    create_if_missing?: boolean;
    include_voided?: boolean;
  }) => Promise<unknown>;
  getPersonLocationTransitions: (payload: {
    person_id: string;
    snapshot_date: string;
    create_if_missing?: boolean;
  }) => Promise<unknown>;
  addLocationEventToday: (payload: {
    person_id: string;
    location: unknown;
    daily_status: unknown;
    occurred_at: unknown;
    source: string;
  }) => Promise<unknown>;
  deleteLocationEventToday: (payload: {
    person_id: string;
    event_id: string;
    reason: string;
  }) => Promise<unknown>;
};

type PeopleControllerDependencies = {
  service: PeopleServiceLike;
};

const createPeopleController = ({ service }: PeopleControllerDependencies) => {
  const addPerson = async (req: Request, res: Response) => {
    res.json(await service.addPersonToday((req.body as Record<string, unknown>) || {}));
  };

  const initializePeople = async (req: Request, res: Response) => {
    res.json(await service.addInitialPeopleToday(req.body?.names));
  };

  const updatePerson = async (req: Request, res: Response) => {
    res.json(
      await service.updatePersonToday(
        req.params.person_id as string,
        (req.body as Record<string, unknown>) || {}
      )
    );
  };

  const replacePerson = async (req: Request, res: Response) => {
    res.json(
      await service.replacePersonToday(
        req.params.person_id as string,
        (req.body as Record<string, unknown>) || {}
      )
    );
  };

  const deletePerson = async (req: Request, res: Response) => {
    res.json(await service.deletePersonToday(req.params.person_id as string));
  };

  const getPersonLocationEvents = async (req: Request, res: Response) => {
    const snapshotDate = req.query.snapshot_date
      ? parseDateOrThrow(String(req.query.snapshot_date))
      : toIsoDate();
    const includeVoided = String(req.query.include_voided ?? "true") !== "false";
    res.json(
      await service.getPersonLocationEvents({
        person_id: req.params.person_id as string,
        snapshot_date: snapshotDate,
        create_if_missing: true,
        include_voided: includeVoided,
      })
    );
  };

  const getPersonTransitions = async (req: Request, res: Response) => {
    const snapshotDate = req.query.snapshot_date
      ? parseDateOrThrow(String(req.query.snapshot_date))
      : toIsoDate();
    res.json(
      await service.getPersonLocationTransitions({
        person_id: req.params.person_id as string,
        snapshot_date: snapshotDate,
        create_if_missing: true,
      })
    );
  };

  const addPersonLocationEvent = async (req: Request, res: Response) => {
    res.json(
      await service.addLocationEventToday({
        person_id: req.params.person_id as string,
        location: req.body?.location,
        daily_status: req.body?.daily_status,
        occurred_at: req.body?.occurred_at,
        source: "manual_ui",
      })
    );
  };

  const deletePersonLocationEvent = async (req: Request, res: Response) => {
    const reason = String(req.query.reason || "correction");
    res.json(
      await service.deleteLocationEventToday({
        person_id: req.params.person_id as string,
        event_id: req.params.event_id as string,
        reason,
      })
    );
  };

  return {
    addPerson,
    initializePeople,
    updatePerson,
    replacePerson,
    deletePerson,
    getPersonLocationEvents,
    getPersonTransitions,
    addPersonLocationEvent,
    deletePersonLocationEvent,
  };
};

export { createPeopleController };
