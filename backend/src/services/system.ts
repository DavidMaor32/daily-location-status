import z from "zod";
import { Server, ServerConfigSchema } from "./server";
import { createDBClient, DatabaseConfigSchema } from "./database";
import { PrismaClient } from "@prisma/client";
import { BackupService } from "./backup";

export const SystemConfigSchema = z.object({
  server: ServerConfigSchema,
  db: DatabaseConfigSchema,
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;

export class System {
  private server?: Server;
  private database: PrismaClient;
  private backupService?: BackupService;

  constructor(private config: SystemConfig) {
    this.database = createDBClient(config.db);
  }

  start = () => {
  try {
    this.backupService = new BackupService(this.database);

    this.server = new Server(
      this.config.server,
      this.database,
      this.backupService
    );

    this.server.start();
    this.backupService.start();
  } catch (err) {
    console.error("System failed to start:", err);
    throw err;
  }
};

  stop = () => {
    this.backupService?.stop();
    this.server?.stop();
  };
}
