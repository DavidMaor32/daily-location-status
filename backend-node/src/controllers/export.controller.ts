import { Request, Response } from "express";
import { parseDateOrThrow, toIsoDate } from "../utils/utils";

type ExportServiceLike = {
  getSnapshotExcelBytes: (
    snapshotDate: string,
    createIfMissing: boolean
  ) => Promise<any[]>;
  getSnapshotsZipBytes: (dateFrom: string, dateTo: string) => Promise<any[]>;
};

type ExportControllerDependencies = {
  service: ExportServiceLike;
};

function sendFileDownload(res: Response, filename: string, content: unknown, mediaType: string) {
  res.setHeader("Content-Type", mediaType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(content);
}

const createExportController = ({ service }: ExportControllerDependencies) => {
  const exportSnapshotDay = async (req: Request, res: Response) => {
    const snapshotDate = parseDateOrThrow(req.params.snapshot_date as string);
    const createIfMissing = snapshotDate === toIsoDate();
    const [filename, content] = await service.getSnapshotExcelBytes(snapshotDate, createIfMissing);
    sendFileDownload(
      res,
      filename,
      content,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  };

  const exportSnapshotRange = async (req: Request, res: Response) => {
    const dateFrom = parseDateOrThrow(String(req.query.date_from));
    const dateTo = parseDateOrThrow(String(req.query.date_to));
    const [filename, content] = await service.getSnapshotsZipBytes(dateFrom, dateTo);
    sendFileDownload(res, filename, content, "application/zip");
  };

  return {
    exportSnapshotDay,
    exportSnapshotRange,
  };
};

export { createExportController };
