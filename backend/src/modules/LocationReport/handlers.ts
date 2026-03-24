import { Request, Response } from "express";
import { LocationReportDal } from "./dal";
import { StatusCodes } from "http-status-codes";
import { entityWithIdValidator } from "../../utils/validations";
import {
  plainLocationReportValidator,
  searchQueryOptionsValidator,
} from "./types";
import { Workbook } from "exceljs";

export const exportReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const params = searchQueryOptionsValidator(req.query);
    const reports = await dal.getAllReports(params);
    const workBook = new Workbook();

    // apply logic

    const dateString = "DD-MM-YYYY";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=" + `${dateString}.xlsx`,
    );
    res.status(StatusCodes.OK);

    await workBook.xlsx.write(res);
    res.end();
  };

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

export const deleteReportHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);

    const reports = await dal.deleteReport(id);

    res.status(StatusCodes.OK).json(reports);
  };
