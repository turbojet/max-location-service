import { describe, expect, it } from 'vitest';
import { LocationInputSchema, locationFromInput } from '../../src/schemas/location.js';

const VALID_INPUT = {
  name: 'Mantra Restaurant',
  type: 'Restaurant',
  id: '19e1545c-8b65-4d83-82f9-7fcad4a23114',
  'opening-hours': '10:00AM-10:00PM',
  image: 'https://example.com/mantra.png',
  radius: 2,
  coordinates: 'x=2,y=2',
};

describe('LocationInputSchema', () => {
  it('accepts a valid input', () => {
    const result = LocationInputSchema.parse(VALID_INPUT);
    expect(result.id).toBe(VALID_INPUT.id);
    expect(result.coordinates).toEqual({ x: 2, y: 2 });
  });

  it('rejects unknown fields', () => {
    const result = LocationInputSchema.safeParse({ ...VALID_INPUT, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID id', () => {
    const result = LocationInputSchema.safeParse({ ...VALID_INPUT, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string fields', () => {
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, name: '' }).success).toBe(false);
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, type: '' }).success).toBe(false);
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, 'opening-hours': '' }).success).toBe(
      false,
    );
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, image: '' }).success).toBe(false);
  });

  it('rejects non-positive or non-integer radius', () => {
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, radius: 0 }).success).toBe(false);
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, radius: -1 }).success).toBe(false);
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, radius: 1.5 }).success).toBe(false);
  });

  it('rejects malformed coordinates', () => {
    expect(LocationInputSchema.safeParse({ ...VALID_INPUT, coordinates: 'x=2;y=2' }).success).toBe(
      false,
    );
  });
});

describe('locationFromInput', () => {
  it('maps the wire shape to the internal domain shape', () => {
    const input = LocationInputSchema.parse(VALID_INPUT);
    const location = locationFromInput(input);
    expect(location).toEqual({
      id: VALID_INPUT.id,
      name: 'Mantra Restaurant',
      type: 'Restaurant',
      openingHours: '10:00AM-10:00PM',
      image: 'https://example.com/mantra.png',
      radius: 2,
      coordinates: { x: 2, y: 2 },
    });
  });
});
