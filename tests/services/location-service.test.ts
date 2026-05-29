import { describe, expect, it } from 'vitest';
import { InMemoryLocationRepository } from '../../src/repositories/in-memory-location-repository.js';
import type { LocationRepository } from '../../src/repositories/location-repository.js';
import type { Location } from '../../src/schemas/location.js';
import { LocationService } from '../../src/services/location-service.js';
import { SpatialIndex } from '../../src/spatial/spatial-index.js';
import { ReadinessState } from '../../src/state/readiness.js';
import { ApiError } from '../../src/errors/api-error.js';
import { DatabaseUnavailableError } from '../../src/errors/database-error.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

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

function buildService(initial: Location[] = []) {
  const repo = new InMemoryLocationRepository(initial);
  const index = new SpatialIndex(initial);
  const readiness = new ReadinessState();
  const service = new LocationService(repo, index, readiness);
  return { service, repo, index, readiness };
}

describe('LocationService', () => {
  it('returns spatial search results', () => {
    const { service } = buildService([makeLocation(ID_A, 5, 5, 3)]);
    const hits = service.search({ x: 5, y: 6 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(ID_A);
  });

  it('findById returns the canonical record or null', async () => {
    const { service } = buildService([makeLocation(ID_A, 1, 1, 1, 'Alpha')]);
    expect(await service.findById(ID_A)).toMatchObject({ name: 'Alpha' });
    expect(await service.findById(ID_B)).toBeNull();
  });

  it('createOrReplace returns created the first time and replaced after', async () => {
    const { service, index } = buildService();
    const first = await service.createOrReplace(makeLocation(ID_A, 1, 1, 1, 'First'));
    expect(first.status).toBe('created');
    expect(index.size()).toBe(1);

    const second = await service.createOrReplace(makeLocation(ID_A, 2, 2, 1, 'Second'));
    expect(second.status).toBe('replaced');
    expect(index.size()).toBe(1);
  });

  it('serializes concurrent writes for the same id and updates both repo and index', async () => {
    const { service, repo, index } = buildService();
    const results = await Promise.all([
      service.createOrReplace(makeLocation(ID_A, 1, 1, 1, 'v1')),
      service.createOrReplace(makeLocation(ID_A, 2, 2, 1, 'v2')),
      service.createOrReplace(makeLocation(ID_A, 3, 3, 1, 'v3')),
    ]);
    expect(results.map((r) => r.status)).toEqual(['created', 'replaced', 'replaced']);
    const stored = await repo.findById(ID_A);
    expect(stored?.name).toBe('v3');
    expect(index.size()).toBe(1);
    expect(index.search({ x: 3, y: 3 }).map((h) => h.id)).toEqual([ID_A]);
  });

  it('throws SERVICE_UNAVAILABLE when readiness is not_ready', async () => {
    const { service, readiness } = buildService([makeLocation(ID_A, 1, 1, 1)]);
    readiness.set('not_ready');
    expect(() => service.search({ x: 0, y: 0 })).toThrow(ApiError);
    await expect(service.findById(ID_A)).rejects.toThrow(ApiError);
    await expect(service.createOrReplace(makeLocation(ID_B, 2, 2, 1))).rejects.toThrow(ApiError);
  });

  it('rejects queued same-id PUTs once an earlier write flips readiness to not_ready', async () => {
    const inner = new InMemoryLocationRepository();
    const readiness = new ReadinessState();
    let writeCount = 0;
    const repo = {
      findAll: () => inner.findAll(),
      findById: (id: string) => inner.findById(id),
      createOrReplace: async (loc: Location) => {
        const result = await inner.createOrReplace(loc);
        writeCount += 1;
        if (writeCount === 1) {
          readiness.set('not_ready');
        }
        return result;
      },
    };
    const index = new SpatialIndex();
    const service = new LocationService(repo, index, readiness);

    const first = service.createOrReplace(makeLocation(ID_A, 1, 1, 1, 'first'));
    const second = service.createOrReplace(makeLocation(ID_A, 2, 2, 1, 'second'));

    await expect(first).resolves.toMatchObject({ status: 'created' });
    await expect(second).rejects.toThrow(ApiError);

    expect(writeCount).toBe(1);
    const stored = await inner.findById(ID_A);
    expect(stored?.name).toBe('first');
  });

  it('flips readiness to not_ready when findById hits a DatabaseUnavailableError', async () => {
    const readiness = new ReadinessState();
    const repo: LocationRepository = {
      findAll: () => Promise.resolve([]),
      findById: () => Promise.reject(new DatabaseUnavailableError('db gone')),
      createOrReplace: () => Promise.reject(new Error('unused')),
    };
    const service = new LocationService(repo, new SpatialIndex(), readiness);
    await expect(service.findById(ID_A)).rejects.toThrow(DatabaseUnavailableError);
    expect(readiness.isReady()).toBe(false);
  });

  it('flips readiness to not_ready when createOrReplace hits a DatabaseUnavailableError', async () => {
    const readiness = new ReadinessState();
    const repo: LocationRepository = {
      findAll: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      createOrReplace: () => Promise.reject(new DatabaseUnavailableError('db gone')),
    };
    const service = new LocationService(repo, new SpatialIndex(), readiness);
    await expect(service.createOrReplace(makeLocation(ID_A, 1, 1, 1))).rejects.toThrow(
      DatabaseUnavailableError,
    );
    expect(readiness.isReady()).toBe(false);
  });

  it('does NOT flip readiness on a non-outage repository error', async () => {
    const readiness = new ReadinessState();
    const repo: LocationRepository = {
      findAll: () => Promise.resolve([]),
      findById: () => Promise.reject(new Error('query syntax')),
      createOrReplace: () => Promise.reject(new Error('unused')),
    };
    const service = new LocationService(repo, new SpatialIndex(), readiness);
    await expect(service.findById(ID_A)).rejects.toThrow('query syntax');
    expect(readiness.isReady()).toBe(true);
  });

  it('marks readiness not_ready when index rebuild also fails after upsert error', async () => {
    const repo = new InMemoryLocationRepository();
    const failingIndex = {
      search: () => [],
      upsert: () => {
        throw new Error('upsert boom');
      },
      rebuild: () => {
        throw new Error('rebuild boom');
      },
      size: () => 0,
    };
    const readiness = new ReadinessState();
    const service = new LocationService(repo, failingIndex as unknown as SpatialIndex, readiness);

    await expect(service.createOrReplace(makeLocation(ID_A, 1, 1, 1))).rejects.toThrow(
      'upsert boom',
    );
    expect(readiness.isReady()).toBe(false);
  });
});
