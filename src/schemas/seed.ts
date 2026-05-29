import { z } from 'zod';
import { LocationInputSchema } from './location.js';

export const SeedFileSchema = z
  .object({
    locations: z.array(LocationInputSchema),
  })
  .strict();

export type SeedFile = z.infer<typeof SeedFileSchema>;
