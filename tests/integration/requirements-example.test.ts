import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { Location } from '../../src/schemas/location.js';
import { makeTestConfig } from '../helpers/config.js';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';
const ID_4 = '44444444-4444-4444-8444-444444444444';

function location(id: string, x: number, y: number, radius: number, name: string): Location {
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

type SearchResponse = {
  'user-location': string;
  locations: Array<{ id: string; name: string; coordinates: string; distance: number }>;
};

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('Requirements example reproduction', () => {
  it('returns restaurants #2 and #4 (in that order) for the example dataset in the requirements at user (3,2)', async () => {
    // Dataset from the challenge requirements:
    //   #1 (1,1) r=1
    //   #2 (2,2) r=2
    //   #3 (5,5) r=1
    //   #4 (2,3) r=5
    // User at (3,2) sees #2 (d=1.0) and #4 (d=sqrt(2)).
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      locations: [
        location(ID_1, 1, 1, 1, 'One'),
        location(ID_2, 2, 2, 2, 'Two'),
        location(ID_3, 5, 5, 1, 'Three'),
        location(ID_4, 2, 3, 5, 'Four'),
      ],
    });

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { client_id: 'reader', client_secret: 'reader-test-secret' },
    });
    const token = tokenResponse.json<{ access_token: string }>().access_token;

    const search = await app.inject({
      method: 'GET',
      url: '/locations/search?x=3&y=2',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(search.statusCode).toBe(200);
    const body = search.json<SearchResponse>();
    expect(body['user-location']).toBe('x=3,y=2');
    expect(body.locations.map((l) => l.id)).toEqual([ID_2, ID_4]);
    expect(body.locations[0]?.distance).toBe(1);
    expect(body.locations[1]?.distance).toBe(1.41421);
  });
});
