import { PrismaClient } from '@prisma/client';

/**
 * Tests target a dedicated database (`bonial_locations_test`) so the integration
 * suite never wipes the dev data the server reads from `bonial_locations`.
 * The default URL still works for the docker-compose setup; CI sets
 * TEST_DATABASE_URL to its own service URL.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5435/bonial_locations_test';

let cached: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (cached === null) {
    cached = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: ['error'],
    });
  }
  return cached;
}

export async function resetLocationsTable(prisma: PrismaClient = getTestPrisma()): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "locations" RESTART IDENTITY CASCADE');
}

export async function closeTestPrisma(): Promise<void> {
  if (cached !== null) {
    await cached.$disconnect();
    cached = null;
  }
}

export async function isDatabaseReachable(): Promise<boolean> {
  const probe = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
    log: ['error'],
  });
  try {
    await probe.$connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect().catch(() => undefined);
  }
}
