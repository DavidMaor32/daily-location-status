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

    const defaultParams = {
      userId: 1,
      locationId: 1,
      dailyStatus: null,
      date: new Date(),
      minDate: new Date('2026-03-22'),
      maxDate: new Date(),
    };

    const params = Object.keys(req.query).length > 0 ? searchQueryOptionsValidator(req.query) : searchQueryOptionsValidator(defaultParams);

    const reports = await dal.getAllReports(params);
    const workBook = new Workbook();
    const sheet = workBook.addWorksheet('דיווח');

    sheet.columns = [
      { header: 'id', key: 'id', width: 20 },
      { header: 'userId', key: 'userId', width: 20 },
      { header: 'locationId', key: 'locationId', width: 20 },
      { header: 'occurredAt', key: 'occurredAt', width: 20 },
      { header: 'createdAt', key: 'createdAt', width: 20 },
      { header: 'isStatusOk', key: 'isStatusOk', width: 20 },
      { header: 'source', key: 'source', width: 20 },
    ];

    reports.forEach(row => sheet.addRow(row));

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
    req.body.occurredAt = new Date();
    
    const data = plainLocationReportValidator(req.body);

    const report = await dal.addReport(data);

    res.status(StatusCodes.CREATED).json(report);
  };
