import { Request, Response } from "express";
import { parseDateOrThrow } from "../utils/utils";

type HistoryServiceLike = {
  listAvailableDates: () => Promise<unknown>;
  restoreSnapshotToToday: (snapshotDate: string) => Promise<unknown>;
};

type HistoryControllerDependencies = {
  service: HistoryServiceLike;
};

const createHistoryController = ({ service }: HistoryControllerDependencies) => {
  const getHistoryDates = async (_req: Request, res: Response) => {
    res.json({ dates: await service.listAvailableDates() });
  };

  const restoreHistoryDateToToday = async (req: Request, res: Response) => {
    const snapshotDate = parseDateOrThrow(req.params.snapshot_date as string);
    res.json(await service.restoreSnapshotToToday(snapshotDate));
  };

  return {
    getHistoryDates,
    restoreHistoryDateToToday,
  };
};

export { createHistoryController };
