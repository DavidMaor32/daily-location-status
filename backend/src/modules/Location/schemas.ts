import z from "zod";

export const PlainLocationScheme = z.object({
  name: z.string(),
});

export const DBLocationScheme = PlainLocationScheme.extend({
  id: z.number(),
});