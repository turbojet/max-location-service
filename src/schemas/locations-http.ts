import { z } from 'zod';
import { LocationIdSchema } from './location.js';

const COORDINATE_STRING = z.string().regex(/^x=\d+,y=\d+$/);

const NonNegativeIntegerString = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer')
  .transform((raw, ctx) => {
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value exceeds safe integer range',
      });
      return z.NEVER;
    }
    return value;
  });

export const LocationIdParamSchema = z
  .object({
    id: LocationIdSchema,
  })
  .strict();

export const SearchQuerySchema = z
  .object({
    x: NonNegativeIntegerString,
    y: NonNegativeIntegerString,
  })
  .strict();

export const LocationSearchHitSchema = z.object({
  id: LocationIdSchema,
  name: z.string().min(1),
  coordinates: COORDINATE_STRING,
  distance: z.number().nonnegative(),
});

export const SearchResponseSchema = z.object({
  'user-location': COORDINATE_STRING,
  locations: z.array(LocationSearchHitSchema),
});

export const LocationDetailSchema = z.object({
  id: LocationIdSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  'opening-hours': z.string().min(1),
  image: z.string().min(1),
  coordinates: COORDINATE_STRING,
});

export type LocationDetail = z.infer<typeof LocationDetailSchema>;
