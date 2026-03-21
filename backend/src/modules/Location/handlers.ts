import { Request, Response } from "express";
import { LocationDal } from "./dal";
import { plainLocationValidator } from "./types";
import { StatusCodes } from "http-status-codes";
import { entityWithIdValidator } from "../../utils/validations";

export const createLocationHandler =
  (dal: LocationDal) => async (req: Request, res: Response) => {
    const { name } = plainLocationValidator(req.body);

    const location = await dal.createLocation(name);

    res.status(StatusCodes.CREATED).json(location);
  };

export const getAllLocationsHandler =
  (dal: LocationDal) => async (_: Request, res: Response) => {
    const locations = await dal.getAllLocations();

    res.status(StatusCodes.OK).json(locations);
  };

export const getLocationByIdHandler =
  (dal: LocationDal) => async (req: Request, res: Response) => {
    const { id } = entityWithIdValidator(req.params);

    const location = await dal.getLocationById(id);

    res.status(StatusCodes.OK).json(location);
  };
