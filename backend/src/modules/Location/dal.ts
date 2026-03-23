import { PrismaClient } from "@prisma/client";
import { DBLocation } from "./types";
import { NotFoundError, AlreadyExistsError } from "../../utils/errors/client";

export class LocationDal {
  private model;
  constructor(prisma: PrismaClient) {
    this.model = prisma.location;
  }

  getAllLocations = (): Promise<DBLocation[]> => this.model.findMany();

  getLocationById = async (id: number): Promise<DBLocation> => {
    const location = await this.model.findUnique({ where: { id } });

    if (!location) {
      throw new NotFoundError("Location", id.toString());
    }

    return location;
  };

  createLocation = async (name: string): Promise<DBLocation> => {
    const existingLocation = await this.model.findUnique({ where: { name } });

    if (existingLocation) {
      throw new AlreadyExistsError("Location", "name", name);
    }

    return this.model.create({ data: { name } });
  };
}