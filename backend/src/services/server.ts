import cors from "cors";
import express, { Express, json, Request, Response } from "express";
import http from "http";
import { StatusCodes } from "http-status-codes";
import z from "zod";
import { UserDal } from "../User/dal.js";
import { createUserRouter } from "../User/router.js";
import logger from "../utils/logger.js";
import { prisma } from "./database.js";

export const ServerConfigSchema = z.object({
  PORT: z.coerce.number().positive(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export class Server {
  private app: Express;
  private server?: http.Server;

  constructor(private config: ServerConfig) {
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
    const userDal = new UserDal(prisma);

    // Register routes
    this.app.use("/api/users", createUserRouter(userDal));

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
