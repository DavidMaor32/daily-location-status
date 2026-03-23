import cors from "cors";
import express, { Express, json, Request, Response } from "express";
import http from "http";
import { StatusCodes } from "http-status-codes";
import z from "zod";
import { UserDal } from "../modules/User/dal";
import { createUserRouter } from "../modules/User/router";
import logger from "../utils/logger";
import { PrismaClient } from "@prisma/client";
import { LocationDal } from "../modules/Location/dal";
import { createLocationRouter } from "../modules/Location/router";
import { LocationReportDal } from "../modules/LocationReport/dal";
import { createLocationReportRouter } from "../modules/LocationReport/router";

export const ServerConfigSchema = z.object({
  PORT: z.coerce.number().positive(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export class Server {
  private app: Express;
  private server?: http.Server;

  constructor(private config: ServerConfig, private dbClient: PrismaClient) {
    this.app = express();
    this.registerMiddlewares();
    this.registerRoutes();
  }

  private registerMiddlewares = () => {
    this.app.use(json());
    this.app.use(cors());
  };

  private registerRoutes = () => {
    // Initialize DALs
    const userDal = new UserDal(this.dbClient);
    const locationDal = new LocationDal(this.dbClient);
    const locationReportDal = new LocationReportDal(
      this.dbClient,
      userDal,
      locationDal
    );

    // Register routes
    this.app.use("/api/users", createUserRouter(userDal));
    this.app.use("/api/locations", createLocationRouter(locationDal));
    this.app.use("/api/location-reports", createLocationReportRouter(locationReportDal));

    this.app.get("/api/health", (_: Request, res: Response) => {
  res.sendStatus(StatusCodes.OK);
});

    this.app.get("/health", (_: Request, res: Response) => {
      res.sendStatus(StatusCodes.OK);
    });
  };

  start = () => {
    this.server = this.app.listen(this.config.PORT, () => {
      logger.info(`server running on port ${this.config.PORT}`);
    });
  };

  stop = () => {
    this.server?.close(() => {
      logger.info(`server gracefully closed`);
    });
  };
}
