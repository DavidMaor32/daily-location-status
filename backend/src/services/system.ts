import z from "zod";
import { Server, ServerConfigSchema } from "./server.js";
import { createDBClient, DatabaseConfigSchema } from "./database.js";
import { PrismaClient } from "@prisma/client";

export const SystemConfigSchema = z.object({
  server: ServerConfigSchema,
  db: DatabaseConfigSchema,
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;

export class System {
  private server?: Server;
  private database: PrismaClient;

  constructor(private config: SystemConfig) {
    this.database = createDBClient(config.db);
  }

  start = () => {
    this.server = new Server(
      this.config.server,
      this.database,
    );
    this.server.start();
  };

  stop = () => {
    this.server?.stop();
  };
}