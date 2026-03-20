import { Request, Response } from "express";
import { UserDal } from "./dal";
import { StatusCodes } from "http-status-codes";
import { partialPlainUserValidator } from "./types";
import { entityWithIdValidator } from "../utils/validations";

export const getAllUsersHandler =
  (dal: UserDal) => async (_: Request, res: Response) => {
    const users = await dal.getAllUsers();

    res.status(StatusCodes.OK).json(users);
  };

export const getUserByIdHandler =
  (dal: UserDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);

    const user = await dal.getUserById(id);

    res.status(StatusCodes.OK).json(user);
  };

export const updateUser =
  (dal: UserDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);
    const updates = partialPlainUserValidator(req.body);

    await dal.updateUser({ id, ...updates });

    res.sendStatus(StatusCodes.NO_CONTENT);
  };
