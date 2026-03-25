import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { LocationReportDal } from "./dal";
import { BackupService } from "../../services/backup";
import * as fs from "fs";
import * as path from "path";
import moment from "moment";

const BACKUP_DIR = "/app/backups";

/**
 * =========================
 * REPORT HANDLERS
 * =========================
 */

export const getReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { date, minDate, maxDate } = req.query;

    const reports = await dal.getReports({
      date: date as string,
      minDate: minDate as string,
      maxDate: maxDate as string,
    });

    res.status(StatusCodes.OK).json(reports);
  };

export const getReportByIdHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { id } = req.params;

    const report = await dal.getReportById(Number(id));

    if (!report) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Report not found" });
    }

    res.status(StatusCodes.OK).json(report);
  };

export const addReportHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const created = await dal.createReport(req.body);
    res.status(StatusCodes.CREATED).json(created);
  };

export const exportReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { date, minDate, maxDate } = req.query;

    const workbook = await dal.createExcelExport({
      date: date as string,
      minDate: minDate as string,
      maxDate: maxDate as string,
    });

    const dateString = moment().format("DD-MM-YYYY");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reports_${dateString}.xlsx`
    );

    await workbook.xlsx.write(res);
  };

/**
 * =========================
 * BACKUP HANDLERS
 * =========================
 */

export const manualBackupHandler =
  (backupService: BackupService) =>
  async (_req: Request, res: Response) => {
    await backupService.runBackup();

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Backup created",
    });
  };

export const getBackupListHandler =
  () => async (_req: Request, res: Response) => {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.status(StatusCodes.OK).json([]);
    }

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((file) => file.endsWith(".xlsx"))
      .sort((a, b) => b.localeCompare(a)); // newest first

    res.status(StatusCodes.OK).json(files);
  };

export const downloadBackupHandler =
  () => async (req: Request, res: Response) => {
    const { file } = req.params;

    if (!file) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "File name is required" });
    }

    const safeFileName = path.basename(file); // prevents path traversal
    const filePath = path.join(BACKUP_DIR, safeFileName);

    if (!fs.existsSync(filePath)) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "File not found" });
    }

    res.download(filePath);
  };
