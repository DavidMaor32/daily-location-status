import { Request, Response } from "express";

type SelfReportServiceLike = {
  updateSelfReportToday: (payload: {
    person_lookup: unknown;
    self_location: unknown;
    self_daily_status: unknown;
    source: string;
  }) => Promise<unknown>;
};

type SelfReportControllerDependencies = {
  service: SelfReportServiceLike;
};

const createSelfReportController = ({ service }: SelfReportControllerDependencies) => {
  const createSelfReport = async (req: Request, res: Response) => {
    res.json(
      await service.updateSelfReportToday({
        person_lookup: req.body?.person_lookup,
        self_location: req.body?.self_location,
        self_daily_status: req.body?.self_daily_status,
        source: "self_report_api",
      })
    );
  };

  return {
    createSelfReport,
  };
};

export { createSelfReportController };
