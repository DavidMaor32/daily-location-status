import z from "zod";
import { createValidator } from "../../utils/validations";
import {
  DBLocationReportSchema,
  PlainLocationReportSchema,
  ReportSourceSchema,
  SearchQueryOptionsSchema,
} from "./schema";

export type ReportSource = z.infer<typeof ReportSourceSchema>;

export type PlainLocationReport = z.infer<typeof PlainLocationReportSchema>;

export type DBLocationReport = z.infer<typeof DBLocationReportSchema>;

export type SearchQueryOptions = z.infer<typeof SearchQueryOptionsSchema>;

export const plainLocationReportValidator = createValidator(
  PlainLocationReportSchema
);
export const searchQueryOptionsValidator = createValidator(
    SearchQueryOptionsSchema
);