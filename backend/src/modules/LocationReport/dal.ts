import { Prisma, PrismaClient } from "@prisma/client";
import { DBLocationReport, PlainLocationReport } from "./types";
import { DeletedEntityError, NotFoundError } from "../../utils/errors/client";
import { SearchQueryOptions } from "./types";
import moment from "moment";
import { UserDal } from "../User/dal";
import { LocationDal } from "../Location/dal";

export class LocationReportDal {
  private model;
  constructor(
    prisma: PrismaClient,
    private userDal: UserDal,
    private locationDal: LocationDal,
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

    where.isArchived = false;

    return await this.model.findMany({
      where,
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
    await this.userDal.getUserById(data.userId);
    await this.locationDal.getLocationById(data.locationId);

    return this.model.create({ data });
  };

  deleteReport = async (id: number) => {
    await this.model.update({
      where: {
        id,
      },
      data: {
        isArchived: true,
      },
    });
  };

  assertNotArchived = async (id: number) => {
    const user = await this.model.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundError("LocationReport", id.toString());
    }

    if (user.isArchived) {
      throw new DeletedEntityError("LocationReport", id.toString());
    }
  };
}
