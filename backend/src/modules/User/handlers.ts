import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { entityWithIdValidator } from "../../utils/validations";
import { UserDal } from "./dal";
import { partialPlainUserValidator, plainUserValidator } from "./types";

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

export const AddUserHandler =
  (dal: UserDal) => async (req: Request, res: Response) => {
    const { fullName, phone } = plainUserValidator(req.body);

    const user = await dal.addUser({ fullName, phone });

    res.status(StatusCodes.CREATED).json(user);
  };
