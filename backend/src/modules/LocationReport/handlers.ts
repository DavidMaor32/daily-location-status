import { Request, Response } from "express";
import { LocationReportDal } from "./dal";
import { StatusCodes } from "http-status-codes";
import { entityWithIdValidator } from "../../utils/validations";
import {
  plainLocationReportValidator,
  searchQueryOptionsValidator,
} from "./types";
import { Workbook } from "exceljs";
import moment from "moment";

export const exportReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    
    const params = Object.keys(req.query).length > 0 ? searchQueryOptionsValidator(req.query) : null;

    const reports = await dal.getAllReports(params??{});

    const workBook = new Workbook();
    const sheet = workBook.addWorksheet('דיווח');

    sheet.columns = [
      { header: 'מספר דיווח', key: 'id', width: 20 },
      { header: 'מספר משתמש', key: 'userId', width: 20 },
      { header: 'מספר מיקום', key: 'locationId', width: 20 },
      { header: 'מתי התרחש', key: 'occurredAt', width: 20 },
      { header: 'מתי דווח', key: 'createdAt', width: 20 },
      { header: 'תקין', key: 'isStatusOk', width: 20 },
      { header: 'הערות', key: 'notes', width: 20 },
      { header: 'מקור', key: 'source', width: 20 },
    ];

    reports.forEach(row => {
      sheet.addRow({
        ...row,
        isStatusOk: row.isStatusOk === true ? "תקין" : row.isStatusOk === false ? "לא תקין" : "לא הוזן",
      });
    });

    const dateString = moment().format('DD-MM-YYYY');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + `${dateString}.xlsx`);
    res.status(StatusCodes.OK)

    await workBook.xlsx.write(res);
    res.end();
  }

export const getReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const params = searchQueryOptionsValidator(req.query);

    const reports = await dal.getAllReports(params);

    res.status(StatusCodes.OK).json(reports);
  };

export const getReportByIdHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);

    const report = await dal.getReportById(id);

    res.status(StatusCodes.OK).json(report);
  };

export const addReportHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const data = plainLocationReportValidator(req.body);

    const report = await dal.addReport(data);

    res.status(StatusCodes.CREATED).json(report);
  };
