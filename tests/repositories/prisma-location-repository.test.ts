import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaLocationRepository } from '../../src/repositories/prisma-location-repository.js';
import type { Location } from '../../src/schemas/location.js';
import {
  closeTestPrisma,
  getTestPrisma,
  isDatabaseReachable,
  resetLocationsTable,
} from '../helpers/prisma.js';

const dbReachable = await isDatabaseReachable();

function makeLocation(id: string, overrides: Partial<Location> = {}): Location {
  return {
    id,
    name: 'Test Restaurant',
    type: 'Restaurant',
    openingHours: '10:00AM-10:00PM',
    image: 'https://example.com/img.png',
    radius: 1,
    coordinates: { x: 1, y: 1 },
    ...overrides,
  };
}

const ID_A = '19e1545c-8b65-4d83-82f9-7fcad4a23114';
const ID_B = '19e1545c-8b65-4d83-82f9-7fcad4a23115';

describe.skipIf(!dbReachable)('PrismaLocationRepository (integration)', () => {
  const prisma = getTestPrisma();
  const repo = new PrismaLocationRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await closeTestPrisma();
  });

  beforeEach(async () => {
    await resetLocationsTable(prisma);
  });

  it('findAll returns an empty array when no rows exist', async () => {
    expect(await repo.findAll()).toEqual([]);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById(ID_A)).toBeNull();
  });

  it('createOrReplace returns created on first write, replaced afterwards', async () => {
    const first = await repo.createOrReplace(makeLocation(ID_A, { name: 'First' }));
    expect(first.status).toBe('created');
    expect(first.location.name).toBe('First');

    const second = await repo.createOrReplace(
      makeLocation(ID_A, { name: 'Second', coordinates: { x: 9, y: 9 } }),
    );
    expect(second.status).toBe('replaced');
    expect(second.location.name).toBe('Second');
    expect(second.location.coordinates).toEqual({ x: 9, y: 9 });

    const fetched = await repo.findById(ID_A);
    expect(fetched?.name).toBe('Second');
    expect(fetched?.coordinates).toEqual({ x: 9, y: 9 });
  });

  it('round-trips all fields including hyphenated opening hours', async () => {
    const input = makeLocation(ID_A, {
      name: 'Round-trip',
      type: 'Cafe',
      openingHours: '08:00AM-11:30PM',
      image: 'https://example.com/x.jpg',
      radius: 5,
      coordinates: { x: -3, y: 4 },
    });
    await repo.createOrReplace(input);
    const fetched = await repo.findById(ID_A);
    expect(fetched).toEqual(input);
  });

  it('findAll returns all stored rows', async () => {
    await repo.createOrReplace(makeLocation(ID_A, { name: 'A' }));
    await repo.createOrReplace(makeLocation(ID_B, { name: 'B' }));
    const all = await repo.findAll();
    expect(all.map((l) => l.id).sort()).toEqual([ID_A, ID_B].sort());
  });
});
