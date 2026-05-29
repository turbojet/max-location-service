import { z } from 'zod';
import { CoordinatesStringSchema, type Coordinates } from './coordinates.js';

export const LocationIdSchema = z.string().uuid();

export const LocationInputSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    id: LocationIdSchema,
    'opening-hours': z.string().min(1),
    image: z.string().min(1),
    radius: z.number().int().positive(),
    coordinates: CoordinatesStringSchema,
  })
  .strict();

export type LocationInput = z.infer<typeof LocationInputSchema>;

export type Location = {
  id: string;
  name: string;
  type: string;
  openingHours: string;
  image: string;
  radius: number;
  coordinates: Coordinates;
};

export function locationFromInput(input: LocationInput): Location {
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    openingHours: input['opening-hours'],
    image: input.image,
    radius: input.radius,
    coordinates: input.coordinates,
  };
}
