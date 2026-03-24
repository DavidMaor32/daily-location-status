import { PrismaClient } from "@prisma/client";
import { DBUser, PlainUser } from "./types";
import { AlreadyExistsError, NotFoundError } from "../../utils/errors/client";

export class UserDal {
  private model;
  constructor(prisma: PrismaClient) {
    this.model = prisma.user;
  }

  getAllUsers = (): Promise<DBUser[]> => this.model.findMany();

  getUserById = async (id: number): Promise<DBUser> => {
    const user = await this.model.findUnique({ where: {id} });

    if(!user) {
        throw new NotFoundError('user', id.toString());
    }

    return user;
  }

  updateUser = async ({id, fullName, phone, telegramUserId}: Partial<PlainUser> & { id: number, telegramUserId?: string}) => {
    await this.getUserById(id);

    await this.model.update({where: {id}, data: {fullName, phone, telegramUserId}});
  }

  addUser = async ({ fullName, phone }: { fullName: string; phone: string }) => {
    const existingUser = await this.model.findUnique({ where: { phone } });

    if (existingUser) {
      throw new AlreadyExistsError("User", "phone", phone);
    }

    return this.model.create({ data: { fullName, phone } });
  };

  getUserByNameAndPhone = async ({ fullName, phone }: { fullName: string; phone: string }) => {
    return await this.model.findUnique({ where: { fullName, phone } });
  };
  
  addUsersFromExcel = async (users: PlainUser[]) => {
    if (users.length === 0) {
      return { count: 0 };
    }
    return await this.model.createMany({
      data: users,
      skipDuplicates: true,
    });
  };
}
