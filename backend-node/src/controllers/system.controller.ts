import { Request, Response } from "express";
import { nowUtcIso, toIsoDate } from "../utils/utils";

type TelegramRuntimeStatusProvider = {
  getRuntimeStatus: () => Record<string, unknown>;
};

type SystemControllerDependencies = {
  telegramService: TelegramRuntimeStatusProvider;
};

const createSystemController = ({ telegramService }: SystemControllerDependencies) => {
  const getApiHealth = async (_req: Request, res: Response) => {
    res.json({ status: "ok", startup_ok: true, startup_error: null });
  };

  const getSystemStatus = async (_req: Request, res: Response) => {
    const telegramStatus = telegramService.getRuntimeStatus();
    res.json({
      server_date: toIsoDate(),
      server_time_utc: nowUtcIso(),
      ...telegramStatus,
    });
  };

  return {
    getApiHealth,
    getSystemStatus,
  };
};

export { createSystemController };
