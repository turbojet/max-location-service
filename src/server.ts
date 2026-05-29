import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { loadConfigFromEnv } from './config/env.js';
import { PrismaLocationRepository } from './repositories/prisma-location-repository.js';
import { SpatialIndex } from './spatial/spatial-index.js';
import { ReadinessState } from './state/readiness.js';
import { LocationService } from './services/location-service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfigFromEnv();

  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: ['warn', 'error'],
  });

  try {
    await prisma.$connect();
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }

  const repository = new PrismaLocationRepository(prisma);
  const readiness = new ReadinessState();

  let initialLocations;
  try {
    initialLocations = await repository.findAll();
  } catch (err) {
    console.error('Failed to load locations from database:', err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }

  const spatialIndex = new SpatialIndex(initialLocations);
  const locationService = new LocationService(repository, spatialIndex, readiness);

  const app = await buildApp({
    config,
    logger: { level: config.logLevel },
    readiness,
    repository,
    spatialIndex,
    locationService,
    readinessProbe: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'received signal, shutting down');
    const timer = setTimeout(() => {
      app.log.error('shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error({ err }, 'error during shutdown');
        process.exit(1);
      });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(
      { count: initialLocations.length },
      'loaded locations from database and built spatial index',
    );
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }
}

void main();
