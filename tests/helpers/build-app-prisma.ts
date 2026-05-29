import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { PrismaLocationRepository } from '../../src/repositories/prisma-location-repository.js';
import { LocationService } from '../../src/services/location-service.js';
import { SpatialIndex } from '../../src/spatial/spatial-index.js';
import { ReadinessState } from '../../src/state/readiness.js';
import { makeTestConfig } from './config.js';

export type AppHandle = {
  app: Awaited<ReturnType<typeof buildApp>>;
  repository: PrismaLocationRepository;
  readiness: ReadinessState;
};

export async function buildAppWithPrisma(prisma: PrismaClient): Promise<AppHandle> {
  const repository = new PrismaLocationRepository(prisma);
  const initial = await repository.findAll();
  const spatialIndex = new SpatialIndex(initial);
  const readiness = new ReadinessState();
  const locationService = new LocationService(repository, spatialIndex, readiness);
  const app = await buildApp({
    config: makeTestConfig({ rateLimit: { authPerMin: 1000, writePerMin: 1000 } }),
    logger: false,
    repository,
    spatialIndex,
    locationService,
    readiness,
  });
  return { app, repository, readiness };
}
