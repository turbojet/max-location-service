import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { makeTestConfig } from '../helpers/config.js';

const ID_A = '11111111-1111-4111-8111-111111111111';

type DetailResponse = {
  id: string;
  name: string;
  coordinates: string;
};

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('Concurrent PUTs for the same id', () => {
  it('serializes concurrent writes and leaves a consistent canonical state', async () => {
    app = await buildApp({
      config: makeTestConfig({ rateLimit: { authPerMin: 1000, writePerMin: 1000 } }),
      logger: false,
      locations: [],
    });

    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { client_id: 'writer', client_secret: 'writer-test-secret' },
      })
    ).json<{ access_token: string }>().access_token;

    const bodies = ['v1', 'v2', 'v3'].map((name, i) => ({
      name,
      type: 'Restaurant',
      id: ID_A,
      'opening-hours': '10:00AM-10:00PM',
      image: 'https://example.com/img.png',
      radius: 1,
      coordinates: `x=${i + 1},y=${i + 1}`,
    }));

    const responses = await Promise.all(
      bodies.map((body) =>
        app!.inject({
          method: 'PUT',
          url: `/locations/${ID_A}`,
          headers: { Authorization: `Bearer ${token}` },
          payload: body,
        }),
      ),
    );

    const statuses = responses.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 200, 201]);

    const finalDetail = await app.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(finalDetail.statusCode).toBe(200);
    const finalBody = finalDetail.json<DetailResponse>();

    const expectedNames = bodies.map((b) => b.name);
    const expectedCoords = bodies.map((b) => b.coordinates);
    expect(expectedNames).toContain(finalBody.name);
    expect(expectedCoords).toContain(finalBody.coordinates);
  });
});
