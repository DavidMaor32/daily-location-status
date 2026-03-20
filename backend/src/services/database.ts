import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import z from "zod";

export const DatabaseConfigSchema = z.object({
    DATABASE_URL: z.url()
});
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export const createDBClient = (config: DatabaseConfig) => 
    new PrismaClient({adapter:
        new PrismaPg({ connectionString: config.DATABASE_URL})
    });
