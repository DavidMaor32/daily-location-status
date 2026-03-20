import { PrismaClient } from "@prisma/client";
import z from "zod";

export const prisma = new PrismaClient();

export const DatabaseConfigSchema = z.object({
    DATABASE_URL: z.url()
});