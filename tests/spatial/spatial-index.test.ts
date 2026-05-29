import { describe, expect, it } from 'vitest';
import { SpatialIndex } from '../../src/spatial/spatial-index.js';
import type { Location } from '../../src/schemas/location.js';

function makeLocation(
  id: string,
  x: number,
  y: number,
  radius: number,
  name = `loc-${id}`,
): Location {
  return {
    id,
    name,
    type: 'Restaurant',
    openingHours: '10:00AM-10:00PM',
    image: 'https://example.com/img.png',
    radius,
    coordinates: { x, y },
  };
}

// UUIDs chosen so that the lexicographic order is A < B < C.
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

describe('SpatialIndex', () => {
  it('returns no hits for an empty index', () => {
    const index = new SpatialIndex();
    expect(index.search({ x: 0, y: 0 })).toEqual([]);
    expect(index.size()).toBe(0);
  });

  it('returns a single hit when the user is strictly inside a circle', () => {
    const index = new SpatialIndex([makeLocation(ID_A, 5, 5, 3)]);
    const hits = index.search({ x: 5, y: 6 });
    expect(hits).toEqual([
      {
        id: ID_A,
        name: 'loc-' + ID_A,
        coordinates: { x: 5, y: 5 },
        distanceSquared: 1,
      },
    ]);
  });

  it('treats the circle boundary as inclusive (distanceSquared === radiusSquared)', () => {
    // Location at (10,10), radius 5 -> point at (10,15) is exactly on the boundary.
    const index = new SpatialIndex([makeLocation(ID_A, 10, 10, 5)]);
    const hits = index.search({ x: 10, y: 15 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.distanceSquared).toBe(25);
  });

  it('excludes points strictly outside the radius even if inside the bounding box', () => {
    // Location at (0,0), radius 5; the bounding box covers (3,4) which is inside the
    // circle (distSq = 25), but (4,4) sits inside the bbox while outside the circle
    // (distSq = 32 > 25).
    const index = new SpatialIndex([makeLocation(ID_A, 0, 0, 5)]);
    expect(index.search({ x: 3, y: 4 })).toHaveLength(1);
    expect(index.search({ x: 4, y: 4 })).toEqual([]);
  });

  it('returns matches sorted by ascending distanceSquared', () => {
    const index = new SpatialIndex([
      makeLocation(ID_A, 0, 0, 100),
      makeLocation(ID_B, 3, 0, 100),
      makeLocation(ID_C, 1, 0, 100),
    ]);
    const hits = index.search({ x: 0, y: 0 });
    expect(hits.map((h) => h.id)).toEqual([ID_A, ID_C, ID_B]);
    expect(hits.map((h) => h.distanceSquared)).toEqual([0, 1, 9]);
  });

  it('breaks ties by lexicographically ascending id', () => {
    // Both circles share the same distanceSquared from the user point.
    const index = new SpatialIndex([
      makeLocation(ID_B, 2, 0, 10),
      makeLocation(ID_C, -2, 0, 10),
      makeLocation(ID_A, 0, 2, 10),
    ]);
    const hits = index.search({ x: 0, y: 0 });
    expect(hits.map((h) => h.id)).toEqual([ID_A, ID_B, ID_C]);
    expect(new Set(hits.map((h) => h.distanceSquared))).toEqual(new Set([4]));
  });

  it('returns an empty array when the user point is outside every circle', () => {
    const index = new SpatialIndex([makeLocation(ID_A, 0, 0, 1), makeLocation(ID_B, 100, 100, 1)]);
    expect(index.search({ x: 50, y: 50 })).toEqual([]);
  });

  it('handles large but safe integer coordinates without overflow surprises', () => {
    const x = 1_000_000;
    const y = 2_000_000;
    const index = new SpatialIndex([makeLocation(ID_A, x, y, 10)]);
    const hits = index.search({ x: x + 6, y: y + 8 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.distanceSquared).toBe(100);
  });

  it('size() reports the number of indexed locations', () => {
    const index = new SpatialIndex([makeLocation(ID_A, 0, 0, 1), makeLocation(ID_B, 5, 5, 1)]);
    expect(index.size()).toBe(2);
  });
});
