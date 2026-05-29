import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadLocationsFromJson } from '../../src/loaders/locations-json-loader.js';
import { makeTestConfig } from '../helpers/config.js';

type SearchResponse = {
  'user-location': string;
  locations: Array<{ id: string; name: string; coordinates: string; distance: number }>;
};

type DetailResponse = {
  id: string;
  name: string;
  type: string;
  'opening-hours': string;
  image: string;
  coordinates: string;
};

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('boot with data/locations.json', () => {
  it('serves search and detail using the bundled sample seed', async () => {
    const path = join(process.cwd(), 'data', 'locations.json');
    const locations = await loadLocationsFromJson(path);
    expect(locations.length).toBeGreaterThan(0);

    app = await buildApp({ config: makeTestConfig(), logger: false, locations });

    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { client_id: 'reader', client_secret: 'reader-test-secret' },
      })
    ).json<{ access_token: string }>().access_token;

    const mantra = locations.find((l) => l.name === 'Mantra Restaurant');
    expect(mantra).toBeDefined();
    const seed = mantra!;

    const detail = await app.inject({
      method: 'GET',
      url: `/locations/${seed.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json<DetailResponse>();
    expect(detailBody).toEqual({
      id: seed.id,
      name: seed.name,
      type: seed.type,
      'opening-hours': seed.openingHours,
      image: seed.image,
      coordinates: `x=${seed.coordinates.x},y=${seed.coordinates.y}`,
    });

    const search = await app.inject({
      method: 'GET',
      url: `/locations/search?x=${seed.coordinates.x}&y=${seed.coordinates.y}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(search.statusCode).toBe(200);
    const searchBody = search.json<SearchResponse>();
    expect(searchBody.locations.map((l) => l.id)).toContain(seed.id);
    // The location's own coordinates are within its own circle (distance 0).
    const self = searchBody.locations.find((l) => l.id === seed.id);
    expect(self?.distance).toBe(0);
  });
});
