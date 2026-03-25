import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Workbook } from "exceljs";
import moment from "moment";
import * as fs from "fs";
import * as path from "path";
import { LocationReportDal } from "./dal";
import { BackupService } from "../../services/backup";
import { searchQueryOptionsValidator } from "./types";

const BACKUP_DIR = "/app/backups";

/**
 * =========================
 * REPORT HANDLERS
 * =========================
 */

export const getReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    // Use searchQueryOptionsValidator so date strings are coerced to Date objects
    // which is what getAllReports expects (SearchQueryOptions uses z.coerce.date())
    const params =
      Object.keys(req.query).length > 0
        ? searchQueryOptionsValidator(req.query)
        : {};

    const reports = await dal.getAllReports(params);

    res.status(StatusCodes.OK).json(reports);
  };

export const getReportByIdHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    const report = await dal.getReportById(id);

    if (!report) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Report not found" });
    }

    res.status(StatusCodes.OK).json(report);
  };

export const addReportHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const created = await dal.addReport(req.body);
    res.status(StatusCodes.CREATED).json(created);
  };

export const exportReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    // Parse and validate query params — coerces date strings to Date objects
    const params =
      Object.keys(req.query).length > 0
        ? searchQueryOptionsValidator(req.query)
        : {};

    // Fetch filtered reports from DB
    const reports = await dal.getAllReports(params);

    // Build Excel workbook
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("דוחות");

    sheet.columns = [
      { header: "מזהה",      key: "id",          width: 8  },
      { header: "משתמש",     key: "userId",      width: 12 },
      { header: "מיקום",     key: "locationId",  width: 12 },
      { header: "סטטוס",     key: "isStatusOk",  width: 12 },
      { header: "מקור",      key: "source",      width: 10 },
      { header: "זמן דיווח", key: "occurredAt",  width: 22 },
      { header: "זמן יצירה", key: "createdAt",   width: 22 },
    ];

    sheet.getRow(1).font = { bold: true };

    reports.forEach((r) => {
      sheet.addRow({
        id:         r.id,
        userId:     r.userId,
        locationId: r.locationId,
        isStatusOk: r.isStatusOk === null ? "לא הוזן"
                  : r.isStatusOk         ? "תקין"
                  :                        "לא תקין",
        source:     r.source,
        occurredAt: moment(r.occurredAt).format("DD/MM/YYYY HH:mm:ss"),
        createdAt:  moment(r.createdAt).format("DD/MM/YYYY HH:mm:ss"),
      });
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

    // path.basename prevents path traversal (e.g. ../../etc/passwd)
    const safeFileName = path.basename(file);
    const filePath = path.join(BACKUP_DIR, safeFileName);

    if (!fs.existsSync(filePath)) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "File not found" });
    }

    res.download(filePath);
  };
