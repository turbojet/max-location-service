import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { Location } from '../../src/schemas/location.js';
import { makeTestConfig } from '../helpers/config.js';

const ID_A = '11111111-1111-4111-8111-111111111111';

function location(id: string): Location {
  return {
    id,
    name: 'Solo',
    type: 'Restaurant',
    openingHours: '10:00AM-10:00PM',
    image: 'https://example.com/img.png',
    radius: 1,
    coordinates: { x: 1, y: 1 },
  };
}

type ErrorBody = { error: { code: string; message: string } };

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('JWT validation on protected routes', () => {
  it('rejects a request without an Authorization header', async () => {
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      locations: [location(ID_A)],
    });
    const response = await app.inject({ method: 'GET', url: `/locations/${ID_A}` });
    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorBody>().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed bearer token', async () => {
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      locations: [location(ID_A)],
    });
    const response = await app.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const sharedConfig = makeTestConfig();
    const forger = await buildApp({
      config: makeTestConfig({
        jwt: {
          secret: 'a-different-jwt-secret-of-sufficient-length-1234',
          ttl: '1h',
        },
      }),
      logger: false,
    });
    const forged = forger.jwt.sign({ sub: 'reader', role: 'read' });
    await forger.close();

    app = await buildApp({ config: sharedConfig, logger: false, locations: [location(ID_A)] });
    const response = await app.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${forged}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an expired token', async () => {
    app = await buildApp({
      config: makeTestConfig({
        jwt: {
          secret: 'test-jwt-secret-of-sufficient-length-1234',
          ttl: '1s',
        },
      }),
      logger: false,
      locations: [location(ID_A)],
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { client_id: 'reader', client_secret: 'reader-test-secret' },
      })
    ).json<{ access_token: string }>().access_token;

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const response = await app.inject({
      method: 'GET',
      url: `/locations/${ID_A}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorBody>().error.code).toBe('UNAUTHORIZED');
  });
});
