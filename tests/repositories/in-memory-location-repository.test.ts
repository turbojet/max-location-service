import { describe, expect, it } from 'vitest';
import { InMemoryLocationRepository } from '../../src/repositories/in-memory-location-repository.js';
import type { Location } from '../../src/schemas/location.js';

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

describe('InMemoryLocationRepository', () => {
  it('initialises with seed locations and returns them via findAll', async () => {
    const repo = new InMemoryLocationRepository([makeLocation(ID_A), makeLocation(ID_B)]);
    const all = await repo.findAll();
    expect(all.map((l) => l.id).sort()).toEqual([ID_A, ID_B]);
  });

  it('rejects duplicate ids during initialization', () => {
    expect(() => new InMemoryLocationRepository([makeLocation(ID_A), makeLocation(ID_A)])).toThrow(
      /duplicate/i,
    );
  });

  it('returns null for an unknown id', async () => {
    const repo = new InMemoryLocationRepository();
    expect(await repo.findById(ID_A)).toBeNull();
  });

  it('returns a copy of the stored value so external mutation does not leak in', async () => {
    const repo = new InMemoryLocationRepository([makeLocation(ID_A)]);
    const found = await repo.findById(ID_A);
    expect(found).not.toBeNull();
    found!.coordinates.x = 999;
    const fetchedAgain = await repo.findById(ID_A);
    expect(fetchedAgain?.coordinates.x).toBe(1);
  });

  it('createOrReplace returns created on first write and replaced afterwards', async () => {
    const repo = new InMemoryLocationRepository();
    const first = await repo.createOrReplace(makeLocation(ID_A, { name: 'First' }));
    expect(first.status).toBe('created');
    expect(first.location.name).toBe('First');

    const second = await repo.createOrReplace(makeLocation(ID_A, { name: 'Second' }));
    expect(second.status).toBe('replaced');
    expect(second.location.name).toBe('Second');

    const fetched = await repo.findById(ID_A);
    expect(fetched?.name).toBe('Second');
  });

  it('createOrReplace clones the input so caller mutations do not affect storage', async () => {
    const repo = new InMemoryLocationRepository();
    const input = makeLocation(ID_A, { name: 'Original' });
    await repo.createOrReplace(input);
    input.name = 'Mutated';
    input.coordinates.x = 999;
    const fetched = await repo.findById(ID_A);
    expect(fetched?.name).toBe('Original');
    expect(fetched?.coordinates.x).toBe(1);
  });
});
