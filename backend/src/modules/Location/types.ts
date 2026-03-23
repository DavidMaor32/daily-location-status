import z from "zod";
import { createValidator } from "../../utils/validations";
import { DBLocationScheme, PlainLocationScheme } from "./schemas";

export type PlainLocation = z.infer<typeof PlainLocationScheme>;
export const plainLocationValidator = createValidator(PlainLocationScheme);

export type DBLocation = z.infer<typeof DBLocationScheme>;
export const dbLocationValidator = createValidator(DBLocationScheme);