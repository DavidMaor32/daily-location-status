import { Request, Response } from "express";
import { parseDateOrThrow } from "../utils/utils";

type SnapshotServiceLike = {
  getTodaySnapshot: () => Promise<unknown>;
  getSnapshotForDate: (snapshotDate: string, createIfMissing: boolean) => Promise<unknown>;
  saveSnapshotForDate: (snapshotDate: string, force: boolean) => Promise<unknown>;
  deleteSnapshotForDate: (snapshotDate: string) => Promise<unknown>;
};

type SnapshotControllerDependencies = {
  service: SnapshotServiceLike;
};

const createSnapshotController = ({ service }: SnapshotControllerDependencies) => {
  const getSnapshotToday = async (_req: Request, res: Response) => {
    res.json(await service.getTodaySnapshot());
  };

  const getSnapshotByDate = async (req: Request, res: Response) => {
    const snapshotDate = parseDateOrThrow(req.params.snapshot_date as string);
    const createIfMissing = String(req.query.create_if_missing ?? "true") !== "false";
    res.json(await service.getSnapshotForDate(snapshotDate, createIfMissing));
  };

  const saveSnapshotByDate = async (req: Request, res: Response) => {
    const snapshotDate = parseDateOrThrow(req.params.snapshot_date as string);
    res.json(await service.saveSnapshotForDate(snapshotDate, true));
  };

  const deleteSnapshotByDate = async (req: Request, res: Response) => {
    const snapshotDate = parseDateOrThrow(req.params.snapshot_date as string);
    res.json(await service.deleteSnapshotForDate(snapshotDate));
  };

  return {
    getSnapshotToday,
    getSnapshotByDate,
    saveSnapshotByDate,
    deleteSnapshotByDate,
  };
};

export { createSnapshotController };