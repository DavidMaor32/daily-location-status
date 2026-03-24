import { PrismaClient } from "@prisma/client";
import { DBLocation, PlainLocation } from "./types";
import { NotFoundError, AlreadyExistsError, DeletedEntityError } from "../../utils/errors/client";

export class LocationDal {
  private model;
  constructor(prisma: PrismaClient) {
    this.model = prisma.location;
  }

  getAllLocations = (): Promise<DBLocation[]> => this.model.findMany({ where: { isArchived: false }});

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

  addLocationsFromExcel = async (locations: PlainLocation[]) => {
    if (locations.length === 0) {
      return { count: 0 };
    }
    return await this.model.createMany({
      data: locations,
      skipDuplicates: true,
    });
  };

  deleteLocation = async (id: number): Promise<void> => {
    this.model.update({
      where: {
        id
      },
      data: {
        isArchived: true
      }
    })
  };

  assertNotArchived = async (id: number) => {
      const user = await this.model.findUnique({ where: { id } });
    
      if (!user) {
        throw new NotFoundError('Location', id.toString());
      }
  
      if (user.isArchived) {
        throw new DeletedEntityError('Location', id.toString());
      }
  };
}