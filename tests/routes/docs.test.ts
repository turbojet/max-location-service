import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { makeTestConfig } from '../helpers/config.js';

type OpenApi = {
  openapi: string;
  info: { title: string; version: string };
  components?: {
    securitySchemes?: Record<string, { type: string; scheme?: string; bearerFormat?: string }>;
  };
  paths?: Record<
    string,
    Record<string, { security?: Array<Record<string, string[]>>; tags?: string[] }>
  >;
};

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('OpenAPI and Swagger UI', () => {
  it('exposes the OpenAPI JSON publicly at /docs/json', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);
    const doc = response.json<OpenApi>();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('Bonial Restaurant Locations API');
    expect(doc.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('lists challenge endpoints with appropriate security and tags', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<OpenApi>();
    const paths = doc.paths ?? {};

    expect(paths['/auth/token']?.post?.tags).toContain('auth');
    expect(paths['/auth/token']?.post?.security).toBeUndefined();

    expect(paths['/ready']?.get?.tags).toContain('system');
    expect(paths['/ready']?.get?.security).toBeUndefined();

    expect(paths['/locations/search']?.get?.tags).toContain('locations');
    expect(paths['/locations/search']?.get?.security).toEqual([{ bearerAuth: [] }]);

    expect(paths['/locations/{id}']?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/locations/{id}']?.put?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('serves the Swagger UI HTML at /docs', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/docs/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.body).toContain('Swagger UI');
  });

  it('does not require authentication for the documentation endpoints', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const json = await app.inject({ method: 'GET', url: '/docs/json' });
    const html = await app.inject({ method: 'GET', url: '/docs/' });
    expect(json.statusCode).toBe(200);
    expect(html.statusCode).toBe(200);
  });
});
