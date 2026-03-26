import { Prisma, PrismaClient } from "@prisma/client";
import { DBLocationReport, PlainLocationReport } from "./types";
import { NotFoundError } from "../../utils/errors/client";
import { SearchQueryOptions } from "./types";
import moment from "moment";
import { UserDal } from "../User/dal";
import { LocationDal } from "../Location/dal";
import { Workbook } from "exceljs";

export class LocationReportDal {
  private model;
  constructor(
    prisma: PrismaClient,
    private userDal: UserDal,
    private locationDal: LocationDal
  ) {
    this.model = prisma.locationReport;
  }

  getAllReports = async (
    params: SearchQueryOptions,
  ): Promise<DBLocationReport[]> => {
    const where: Prisma.LocationReportWhereInput = {};

    if (params.userId !== undefined) {
      where.userId = params.userId;
    }

    if (params.locationId !== undefined) {
      where.locationId = params.locationId;
    }

    if (params.dailyStatus !== undefined) {
      where.isStatusOk = params.dailyStatus;
    }

    if (params.date || params.minDate || params.maxDate) {
      const baseDate = params.date ?? new Date();
      const minDate = moment(params.minDate ?? baseDate)
        .startOf("day")
        .toDate();
      const maxDate = moment(params.maxDate ?? baseDate)
        .startOf("day")
        .add(1, "day")
        .toDate();

      where.occurredAt = {
        gte: minDate,
        lt: maxDate,
      };
    }

    return await this.model.findMany({
      where,
    });
  };

  createExcelExport = async (params: SearchQueryOptions): Promise<Workbook> => {
    const reports = await this.getAllReports(params);

    const workBook = new Workbook();
    const sheet = workBook.addWorksheet('דיווח');

    const rows = await Promise.all(reports.map(async row => {
      const user = await this.userDal.getUserById(row.userId);
      const location = await this.locationDal.getLocationById(row.locationId);
      return [
        user.fullName,
        location.name,
        row.occurredAt.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }),
        row.occurredAt.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' }),
        row.isStatusOk === true ? "תקין" : row.isStatusOk === false ? "לא תקין" : "לא הוזן",
        row.notes,
        row.source,
      ];
    }));

    sheet.addTable({
      name: 'ReportsTable',
      ref: 'A1',
      headerRow: true,
      style: {
        theme: 'TableStyleMedium2',
        showRowStripes: true,
        showColumnStripes: false,
        showFirstColumn: true,
        showLastColumn: true,
      },
      columns: [
        { name: 'שם משתמש', filterButton: true },
        { name: 'מיקום', filterButton: true },
        { name: 'תאריך', filterButton: true },
        { name: 'שעה', filterButton: true },
        { name: 'סטטוס', filterButton: true },
        { name: 'הערות', filterButton: true },
        { name: 'מקור', filterButton: true },
      ],
      rows,
    });

    sheet.columns.forEach(column => {
      let maxLength = 0;
      column.values?.forEach(value => {
        if (value && value!.toString().length > maxLength) {
          maxLength = value!.toString().length;
        }
      });
      column.width = maxLength + 5;
    });

    return workBook;
  }

  getReportById = async (id: number): Promise<DBLocationReport> => {
    const report = await this.model.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundError("LocationReport", id.toString());
    }

    return report;
  };

  addReport = async (data: PlainLocationReport): Promise<DBLocationReport> => {
    
    const existingUserId = await this.userDal.getUserById(data.userId);
    const existingLocationId = await this.locationDal.getLocationById(data.locationId);

    if (!existingUserId || !existingLocationId) {
      throw new NotFoundError("Not Found", !existingUserId && !existingLocationId? `Location ${data.locationId.toString()} and User ${data.userId.toString()}` : existingLocationId? `User ${data.userId.toString()}` : `Location ${data.locationId.toString()}`);
    }

    return this.model.create({ data });
  };

  getDailySummaryData = async (date: Date) => {
    const where =  {
        occurredAt: {
          gte: moment(date).startOf('day').toDate(),
          lt: moment(date).startOf('date').add(1, 'day').toDate(),
        }
      }

    const reportsCounts = await this.model.groupBy({
      by: ['userId'],
      _count: {
        id: true,
      },
      where,
    });
  }
}
