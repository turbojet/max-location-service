import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ApiError } from '../errors/api-error.js';
import { serializeCoordinates } from '../schemas/coordinates.js';
import { LocationInputSchema, locationFromInput, type Location } from '../schemas/location.js';
import {
  LocationDetailSchema,
  LocationIdParamSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  type LocationDetail,
} from '../schemas/locations-http.js';
import type { LocationService } from '../services/location-service.js';
import { roundDistanceFromSquared } from '../utils/distance.js';

type Options = {
  service: LocationService;
  writeRateLimitPerMin: number;
};

export const locationRoutes: FastifyPluginCallback<Options> = (app, opts, done) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/locations/search',
    {
      config: { requireAuth: { role: 'read' } },
      schema: {
        tags: ['locations'],
        summary: 'Search restaurants whose visibility circle contains the user',
        security: [{ bearerAuth: [] }],
        querystring: SearchQuerySchema,
        response: { 200: SearchResponseSchema },
      },
    },
    (request) => {
      const { x, y } = request.query;
      const hits = opts.service.search({ x, y });
      return {
        'user-location': serializeCoordinates({ x, y }),
        locations: hits.map((hit) => ({
          id: hit.id,
          name: hit.name,
          coordinates: serializeCoordinates(hit.coordinates),
          distance: roundDistanceFromSquared(hit.distanceSquared),
        })),
      };
    },
  );

  typed.get(
    '/locations/:id',
    {
      config: { requireAuth: { role: 'read' } },
      schema: {
        tags: ['locations'],
        summary: 'Get a restaurant by id',
        security: [{ bearerAuth: [] }],
        params: LocationIdParamSchema,
        response: { 200: LocationDetailSchema },
      },
    },
    async (request) => {
      const location = await opts.service.findById(request.params.id);
      if (!location) {
        throw ApiError.notFound('Location not found');
      }
      return toLocationDetail(location);
    },
  );

  typed.put(
    '/locations/:id',
    {
      config: {
        requireAuth: { role: 'write' },
        rateLimit: {
          max: opts.writeRateLimitPerMin,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.user.sub,
        },
      },
      schema: {
        tags: ['locations'],
        summary: 'Create or replace a restaurant',
        security: [{ bearerAuth: [] }],
        params: LocationIdParamSchema,
        body: LocationInputSchema,
        response: {
          200: LocationDetailSchema,
          201: LocationDetailSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.params.id !== request.body.id) {
        throw ApiError.idMismatch();
      }
      const location = locationFromInput(request.body);
      const result = await opts.service.createOrReplace(location);
      reply.status(result.status === 'created' ? 201 : 200);
      return toLocationDetail(result.location);
    },
  );

  done();
};

function toLocationDetail(location: Location): LocationDetail {
  return {
    id: location.id,
    name: location.name,
    type: location.type,
    'opening-hours': location.openingHours,
    image: location.image,
    coordinates: serializeCoordinates(location.coordinates),
  };
}
