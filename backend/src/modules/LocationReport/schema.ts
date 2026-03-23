import z from "zod";

export const DailyStatusOkSchema = z.boolean().nullable();

const sources = ["ui", "bot"] as const;
export const ReportSourceSchema = z.enum(sources);

export const PlainLocationReportSchema = z.object({
  userId: z.number(),
  locationId: z.number(),
  occurredAt: z.date(),
  isStatusOk: DailyStatusOkSchema,
  source: ReportSourceSchema,
});

export const DBLocationReportSchema = PlainLocationReportSchema.extend({
    id: z.number(),
    createdAt: z.date(),
});

export const SearchQueryOptionsSchema = z
  .object({
    userId: z.number(),
    locationId: z.number(),
    dailyStatus: z.boolean().nullable(),
    date: z.date(),
    minDate: z.date(),
    maxDate: z.date(),
  })
  .partial();
