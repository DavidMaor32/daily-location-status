import { Prisma, PrismaClient } from "@prisma/client";
import { DBLocationReport, PlainLocationReport } from "./types";
import { ClientError, NotFoundError } from "../../utils/errors/client";
import { SearchQueryOptions } from "./types";
import moment from "moment";
import { UserDal } from "../User/dal";
import { LocationDal } from "../Location/dal";

export class LocationReportDal {
  private model;
  constructor(
    prisma: PrismaClient,
    private userDal: UserDal,
    private locationDal: LocationDal
  ) {
    this.model = prisma.locationReport;
  }

  #createDateRAange = ({
    date,
    min,
    max,
  }: Partial<{ date: Date; min: Date; max: Date }>) => {
    if (date) {
        return {
            min: 0, 
            max: 0,
        }
    } else if (min && max) {
        return {
            min: 0,
            max: 0,
        }
    }

  };

  getAllReports = async (
    params: SearchQueryOptions,
  ): Promise<DBLocationReport[]> => {
    const today = new Date();

    const date = params?.date ?? today;

    const minDate = moment(params?.minDate ?? date)
      .startOf("day")
      .toDate();
    const maxDate = moment(params?.maxDate ?? date)
      .startOf("day")
      .add(1, "day")
      .toDate();

    const dateFilter: Prisma.DateTimeFilter = {
      lte: minDate,
      gte: maxDate,
    };

    return await this.model.findMany({
      where: {
        ...params,
        occurredAt: dateFilter,
      },
    });
  };

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
