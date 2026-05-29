import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ReadinessState } from '../../src/state/readiness.js';
import type { Location } from '../../src/schemas/location.js';
import { makeTestConfig } from '../helpers/config.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

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

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

async function withApp(
  init?: Partial<Parameters<typeof buildApp>[0]>,
): Promise<Awaited<ReturnType<typeof buildApp>>> {
  const built = await buildApp({
    config: makeTestConfig(),
    logger: false,
    ...init,
  });
  app = built;
  return built;
}

async function tokenFor(
  builtApp: Awaited<ReturnType<typeof buildApp>>,
  role: 'reader' | 'writer',
): Promise<string> {
  const response = await builtApp.inject({
    method: 'POST',
    url: '/auth/token',
    payload: {
      client_id: role,
      client_secret: role === 'reader' ? 'reader-test-secret' : 'writer-test-secret',
    },
  });
  return response.json<{ access_token: string }>().access_token;
}

const PUT_BODY = {
  name: 'Mantra',
  type: 'Restaurant',
  id: ID_A,
  'opening-hours': '10:00AM-10:00PM',
  image: 'https://example.com/m.png',
  radius: 2,
  coordinates: 'x=5,y=5',
};

type ErrorBody = { error: { code: string; message: string } };

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

describe('GET /locations/search', () => {
  let readerToken: string;

  beforeEach(async () => {
    const built = await withApp({
      locations: [
        makeLocation(ID_A, 5, 5, 5, 'Alpha'),
        makeLocation(ID_B, 100, 100, 1, 'Far'),
        makeLocation(ID_C, 6, 5, 5, 'Beta'),
      ],
    });
    readerToken = await tokenFor(built, 'reader');
  });

  it('returns 401 without a token', async () => {
    const response = await app!.inject({ method: 'GET', url: '/locations/search?x=5&y=5' });
    expect(response.statusCode).toBe(401);
  });

  it('returns matching locations sorted by distance with rounded distance', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/locations/search?x=5&y=5',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<SearchResponse>();
    expect(body['user-location']).toBe('x=5,y=5');
    expect(body.locations.map((l) => l.id)).toEqual([ID_A, ID_C]);
    expect(body.locations[0]?.distance).toBe(0);
    expect(body.locations[1]?.distance).toBe(1);
    expect(body.locations[0]?.coordinates).toBe('x=5,y=5');
  });

  it('returns 400 for missing query params', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/locations/search?x=5',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for negative coordinates', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/locations/search?x=-1&y=5',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for an unknown query field', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/locations/search?x=5&y=5&extra=nope',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it.each(['x=&y=', 'x=&y=5', 'x=5&y=', 'x=abc&y=5', 'x=3.5&y=5', 'x=-1&y=5'])(
    'returns 400 for invalid query string %j',
    async (qs) => {
      const response = await app!.inject({
        method: 'GET',
        url: `/locations/search?${qs}`,
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().error.code).toBe('VALIDATION_ERROR');
    },
  );
});

describe('GET /locations/:id', () => {
  let readerToken: string;

  beforeEach(async () => {
    const built = await withApp({
      locations: [makeLocation(ID_A, 5, 5, 5, 'Alpha')],
    });
    readerToken = await tokenFor(built, 'reader');
  });

  it('returns the location detail without radius', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<DetailResponse>();
    expect(body).toEqual({
      id: ID_A,
      name: 'Alpha',
      type: 'Restaurant',
      'opening-hours': '10:00AM-10:00PM',
      image: 'https://example.com/img.png',
      coordinates: 'x=5,y=5',
    });
    expect(body).not.toHaveProperty('radius');
  });

  it('returns 404 for an unknown id', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: `/locations/${ID_C}`,
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>().error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/locations/not-a-uuid',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const response = await app!.inject({ method: 'GET', url: `/locations/${ID_A}` });
    expect(response.statusCode).toBe(401);
  });
});

describe('PUT /locations/:id', () => {
  let readerToken: string;
  let writerToken: string;

  beforeEach(async () => {
    const built = await withApp({ locations: [] });
    readerToken = await tokenFor(built, 'reader');
    writerToken = await tokenFor(built, 'writer');
  });

  it('creates a new location with 201', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: PUT_BODY,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<DetailResponse>();
    expect(body.id).toBe(ID_A);
    expect(body.coordinates).toBe('x=5,y=5');
    expect(body).not.toHaveProperty('radius');
  });

  it('replaces an existing location with 200', async () => {
    await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: PUT_BODY,
    });
    const updated = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: { ...PUT_BODY, name: 'Renamed', coordinates: 'x=8,y=8' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<DetailResponse>().name).toBe('Renamed');
  });

  it('returns 409 ID_MISMATCH when path id differs from body id', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_B}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: PUT_BODY,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().error.code).toBe('ID_MISMATCH');
  });

  it('returns 403 when the caller has the read role only', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${readerToken}` },
      payload: PUT_BODY,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorBody>().error.code).toBe('FORBIDDEN');
  });

  it('returns 401 without a token', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      payload: PUT_BODY,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for missing required fields', async () => {
    const { radius, ...incomplete } = PUT_BODY;
    void radius;
    const response = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: incomplete,
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for unknown body fields', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: { ...PUT_BODY, extra: 'nope' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for non-uuid path id', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: '/locations/not-a-uuid',
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: PUT_BODY,
    });
    expect(response.statusCode).toBe(400);
  });

  it('persists writes such that subsequent reads see them', async () => {
    await app!.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: PUT_BODY,
    });
    const detail = await app!.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<DetailResponse>().name).toBe('Mantra');

    const search = await app!.inject({
      method: 'GET',
      url: '/locations/search?x=5&y=5',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json<SearchResponse>().locations.map((l) => l.id)).toContain(ID_A);
  });

  it('rate limits PUTs per JWT sub', async () => {
    await app!.close();
    const built = await withApp({
      config: makeTestConfig({
        rateLimit: { authPerMin: 1000, writePerMin: 2 },
      }),
    });
    const token = await tokenFor(built, 'writer');
    const send = () =>
      built.inject({
        method: 'PUT',
        url: `/locations/${ID_A}`,
        headers: { Authorization: `Bearer ${token}` },
        payload: PUT_BODY,
      });
    expect((await send()).statusCode).toBe(201);
    expect((await send()).statusCode).toBe(200);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.json<ErrorBody>().error.code).toBe('RATE_LIMITED');
  });
});

describe('/locations/* when not_ready', () => {
  it('returns 503 across all location endpoints once the instance is not_ready', async () => {
    const readiness = new ReadinessState();
    const built = await withApp({ readiness, locations: [makeLocation(ID_A, 5, 5, 5)] });
    const token = await tokenFor(built, 'writer');
    readiness.set('not_ready');

    const search = await built.inject({
      method: 'GET',
      url: '/locations/search?x=5&y=5',
      headers: { Authorization: `Bearer ${token}` },
    });
    const detail = await built.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    const put = await built.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: PUT_BODY,
    });
    expect(search.statusCode).toBe(503);
    expect(detail.statusCode).toBe(503);
    expect(put.statusCode).toBe(503);
  });
});
