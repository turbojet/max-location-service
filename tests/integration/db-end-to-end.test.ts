import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildAppWithPrisma, type AppHandle } from '../helpers/build-app-prisma.js';
import { closeTestPrisma, getTestPrisma, isDatabaseReachable, resetLocationsTable } from '../helpers/prisma.js';

const dbReachable = await isDatabaseReachable();

const ID_A = '11111111-1111-4111-8111-111111111111';

type DetailResponse = {
  id: string;
  name: string;
  coordinates: string;
};

type SearchResponse = {
  locations: { id: string; distance: number }[];
};

function makeBody(name: string, coords: string): Record<string, unknown> {
  return {
    name,
    type: 'Restaurant',
    id: ID_A,
    'opening-hours': '10:00AM-10:00PM',
    image: 'https://example.com/img.png',
    radius: 5,
    coordinates: coords,
  };
}

async function authToken(handle: AppHandle, role: 'reader' | 'writer'): Promise<string> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/auth/token',
    payload: {
      client_id: role,
      client_secret: `${role}-test-secret`,
    },
  });
  return res.json<{ access_token: string }>().access_token;
}

describe.skipIf(!dbReachable)('Postgres-backed end-to-end flow', () => {
  const prisma = getTestPrisma();
  let handle: AppHandle | undefined;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await closeTestPrisma();
  });

  beforeEach(async () => {
    await resetLocationsTable(prisma);
  });

  afterEach(async () => {
    if (handle) {
      await handle.app.close();
      handle = undefined;
    }
  });

  it('PUTs through to Postgres and round-trips via GET and search', async () => {
    handle = await buildAppWithPrisma(prisma);
    const writerToken = await authToken(handle, 'writer');
    const readerToken = await authToken(handle, 'reader');

    const putRes = await handle.app.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: makeBody('Persisted', 'x=3,y=3'),
    });
    expect(putRes.statusCode).toBe(201);

    const dbRow = await prisma.location.findUnique({ where: { id: ID_A } });
    expect(dbRow).toMatchObject({ name: 'Persisted', x: 3, y: 3, radius: 5 });

    const getRes = await handle.app.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json<DetailResponse>().name).toBe('Persisted');

    const searchRes = await handle.app.inject({
      method: 'GET',
      url: '/locations/search?x=3&y=3',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json<SearchResponse>().locations.map((l) => l.id)).toContain(ID_A);
  });

  it('serializes concurrent same-id PUTs to a single created and consistent canonical state', async () => {
    handle = await buildAppWithPrisma(prisma);
    const token = await authToken(handle, 'writer');

    const bodies = ['v1', 'v2', 'v3'].map((name, i) =>
      makeBody(name, `x=${i + 1},y=${i + 1}`),
    );

    const responses = await Promise.all(
      bodies.map((body) =>
        handle!.app.inject({
          method: 'PUT',
          url: `/locations/${ID_A}`,
          headers: { Authorization: `Bearer ${token}` },
          payload: body,
        }),
      ),
    );

    const statuses = responses.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 200, 201]);

    const row = await prisma.location.findUnique({ where: { id: ID_A } });
    expect(['v1', 'v2', 'v3']).toContain(row?.name);

    const count = await prisma.location.count();
    expect(count).toBe(1);
  });

  it('search reflects the post-PUT state of the in-memory index', async () => {
    handle = await buildAppWithPrisma(prisma);
    const writerToken = await authToken(handle, 'writer');
    const readerToken = await authToken(handle, 'reader');

    await handle.app.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: makeBody('Original', 'x=0,y=0'),
    });
    await handle.app.inject({
      method: 'PUT',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${writerToken}` },
      payload: makeBody('Moved', 'x=10,y=10'),
    });

    const nearOriginal = await handle.app.inject({
      method: 'GET',
      url: '/locations/search?x=0&y=0',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(nearOriginal.json<SearchResponse>().locations).toEqual([]);

    const nearMoved = await handle.app.inject({
      method: 'GET',
      url: '/locations/search?x=10&y=10',
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    expect(nearMoved.json<SearchResponse>().locations.map((l) => l.id)).toContain(ID_A);
  });
});
