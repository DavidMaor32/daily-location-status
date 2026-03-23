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
    userId: z.coerce.number().optional(),
    locationId: z.coerce.number().optional(),
    isStatusOk: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : v === "true" ? true : false
      ),
    date: z.coerce.date().optional(),
    minDate: z.coerce.date().optional(),
    maxDate: z.coerce.date().optional(),
  })
  .optional();
