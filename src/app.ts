import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { ClientRegistry } from './auth/client-registry.js';
import './auth/jwt-types.js';
import { registerAuthHook } from './auth/route-guards.js';
import type { Config } from './config/config.js';
import { errorHandler, notFoundHandler } from './errors/error-handler.js';
import { InMemoryLocationRepository } from './repositories/in-memory-location-repository.js';
import type { LocationRepository } from './repositories/location-repository.js';
import { authRoutes } from './routes/auth.js';
import { locationRoutes } from './routes/locations.js';
import { readyRoutes, type ReadinessProbe } from './routes/ready.js';
import type { Location } from './schemas/location.js';
import { LocationService } from './services/location-service.js';
import { SpatialIndex } from './spatial/spatial-index.js';
import { ReadinessState } from './state/readiness.js';

export type BuildAppOptions = {
  config: Config;
  logger?: FastifyServerOptions['logger'];
  readiness?: ReadinessState;
  clients?: ClientRegistry;
  locations?: Location[];
  repository?: LocationRepository;
  spatialIndex?: SpatialIndex;
  locationService?: LocationService;
  readinessProbe?: ReadinessProbe;
};

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const readiness = opts.readiness ?? new ReadinessState();
  const clients = opts.clients ?? ClientRegistry.fromAuthConfig(opts.config.auth);

  const initialLocations = opts.locations ?? [];
  const repository = opts.repository ?? new InMemoryLocationRepository(initialLocations);
  const spatialIndex = opts.spatialIndex ?? new SpatialIndex(initialLocations);
  const locationService =
    opts.locationService ?? new LocationService(repository, spatialIndex, readiness);

  const app = Fastify({
    logger: opts.logger ?? { level: opts.config.logLevel },
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        allErrors: true,
      },
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(fastifyJwt, {
    secret: opts.config.jwt.secret,
    sign: { algorithm: 'HS256', expiresIn: opts.config.jwt.ttl },
  });

  registerAuthHook(app);

  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Bonial Restaurant Locations API',
        description:
          'Spatial restaurant search and management API for the Bonial Technical Challenge.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'auth', description: 'Token issuance' },
        { name: 'locations', description: 'Restaurant search and management' },
        { name: 'system', description: 'Operational endpoints' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  await app.register(readyRoutes, {
    readiness,
    ...(opts.readinessProbe ? { probe: opts.readinessProbe } : {}),
  });
  await app.register(authRoutes, {
    clients,
    jwtTtl: opts.config.jwt.ttl,
    rateLimitPerMin: opts.config.rateLimit.authPerMin,
  });
  await app.register(locationRoutes, {
    service: locationService,
    writeRateLimitPerMin: opts.config.rateLimit.writePerMin,
  });

  return app;
}
