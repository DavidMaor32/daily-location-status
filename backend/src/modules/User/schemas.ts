import z from 'zod';

export const PlainUserScheme = z.object({
    fullName: z.string(),
    phone: z.string(),
});

export const PartialPlainUserScheme = PlainUserScheme.partial();

export const DBUserScheme = PlainUserScheme.extend({
    id: z.number(),
    telegramUserId: z.string().nullable(),
    phone: z.string()
});

export const PlainUserExcelScheme = z.array(PlainUserScheme);