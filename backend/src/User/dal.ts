import { PrismaClient } from "@prisma/client";
import { DBUser, PlainUser } from "./types";
import { NotFoundError } from "../utils/errors/client";

export class UserDal {
  private model;
  constructor(prisma: PrismaClient) {
    this.model = prisma.person;
  }

  getAllUsers = (): Promise<DBUser[]> => this.model.findMany();

  getUserById = async (id: number): Promise<DBUser> => {
    const user = await this.model.findUnique({ where: {id} });

    if(!user) {
        throw new NotFoundError('user', id.toString());
    }

    return user;
  }

  updateUser = async ({id, fullName, phone}: Partial<PlainUser> & { id: number}) => {
    await this.getUserById(id);

    await this.model.update({where: {id}, data: {fullName, phone}});
  }
}
