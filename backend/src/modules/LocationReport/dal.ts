import { Prisma, PrismaClient } from "@prisma/client";
import { DBLocationReport, PlainLocationReport } from "./types";
import { NotFoundError } from "../../utils/errors/client";
import { SearchQueryOptions } from "./types";
import moment from "moment";

export class LocationReportDal {
  private model;
  constructor(prisma: PrismaClient) {
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

  //TODO: test errors on non existing locationId/userId
  addReport = async (data: PlainLocationReport): Promise<DBLocationReport> => {
    return this.model.create({ data });
  };
}
