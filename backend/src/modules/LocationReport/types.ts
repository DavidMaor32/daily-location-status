import z from "zod";
import { DailyStatusOkSchema, DBLocationReportSchema, PlainLocationReportSchema, ReportSourceSchema, SearchQueryOptionsSchema } from "./schema";

export type ReportSource = z.infer<typeof ReportSourceSchema>;

export type DailyStatusOk = z.infer<typeof DailyStatusOkSchema>;

export type PlainLocationReport = z.infer<typeof PlainLocationReportSchema>;

export type DBLocationReport = z.infer<typeof DBLocationReportSchema>;

export type SearchQueryOptions = z.infer<typeof SearchQueryOptionsSchema>;