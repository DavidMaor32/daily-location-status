import { Request, Response } from "express";
import { LocationReportDal } from "./dal";
import { StatusCodes } from "http-status-codes";
import { entityWithIdValidator } from "../../utils/validations";
import {
  partialLocationReportValidator,
  plainLocationReportValidator,
  searchQueryOptionsValidator,
} from "./types";
import moment from "moment";

export const exportReportsHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const params = Object.keys(req.query).length > 0 ? searchQueryOptionsValidator(req.query) : null;
    const workBook = await dal.createExcelExport(params ?? {});

    const dateString = moment().format('DD-MM-YYYY');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + `${dateString}.xlsx`);
    res.status(StatusCodes.OK);

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

export const updateReportHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);
    const data = partialLocationReportValidator(req.body);

    const report = await dal.updateReport(id, data);

    res.status(StatusCodes.OK).json(report);
  };

export const deleteReportHandler =
  (dal: LocationReportDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);

    await dal.deleteReport(id);

    res.sendStatus(StatusCodes.NO_CONTENT);
  };
