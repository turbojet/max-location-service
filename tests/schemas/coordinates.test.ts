import { describe, expect, it } from 'vitest';
import { CoordinatesStringSchema, serializeCoordinates } from '../../src/schemas/coordinates.js';

describe('CoordinatesStringSchema', () => {
  it('parses a well-formed coordinate string into numeric x and y', () => {
    const result = CoordinatesStringSchema.parse('x=3,y=2');
    expect(result).toEqual({ x: 3, y: 2 });
  });

  it('accepts zero coordinates', () => {
    expect(CoordinatesStringSchema.parse('x=0,y=0')).toEqual({ x: 0, y: 0 });
  });

  it('accepts large but safe integer coordinates', () => {
    expect(CoordinatesStringSchema.parse('x=1000000,y=2000000')).toEqual({
      x: 1_000_000,
      y: 2_000_000,
    });
  });

  it.each(['x=3, y=2', 'X=3,Y=2', 'x=3;y=2', 'x=-1,y=2', 'x=3.5,y=2', 'y=2,x=3', '3,2', ''])(
    'rejects malformed coordinate string %j',
    (value) => {
      expect(CoordinatesStringSchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects non-string input', () => {
    expect(CoordinatesStringSchema.safeParse(42).success).toBe(false);
    expect(CoordinatesStringSchema.safeParse({ x: 3, y: 2 }).success).toBe(false);
  });
});

describe('serializeCoordinates', () => {
  it('formats numeric coordinates back to the wire shape', () => {
    expect(serializeCoordinates({ x: 3, y: 2 })).toBe('x=3,y=2');
  });

  it('round-trips parsed coordinates', () => {
    const parsed = CoordinatesStringSchema.parse('x=7,y=11');
    expect(serializeCoordinates(parsed)).toBe('x=7,y=11');
  });
});
