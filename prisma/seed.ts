import { PrismaClient } from '@prisma/client';
import { loadLocationsFromJson } from '../src/loaders/locations-json-loader.js';
import type { Location } from '../src/schemas/location.js';

// Postgres caps a single statement at 32,767 bound parameters. With 8 columns
// per row, 4,000 rows per batch stays well under that limit while keeping the
// number of round-trips small (e.g. 100,000 rows → 25 batches).
const BATCH_SIZE = 4_000;
const COLUMNS_PER_ROW = 8;

async function main(): Promise<void> {
  const path = process.env.LOCATIONS_JSON_PATH ?? 'data/locations.json';
  const locations = await loadLocationsFromJson(path);

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < locations.length; i += BATCH_SIZE) {
          const batch = locations.slice(i, i + BATCH_SIZE);
          const placeholders = batch
            .map((_, k) => {
              const base = k * COLUMNS_PER_ROW;
              return `($${base + 1}::uuid,$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
            })
            .join(',');
          const values = batch.flatMap(toRowValues);
          await tx.$executeRawUnsafe(
            `INSERT INTO locations (id, name, type, opening_hours, image, radius, x, y)
             VALUES ${placeholders}
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               type = EXCLUDED.type,
               opening_hours = EXCLUDED.opening_hours,
               image = EXCLUDED.image,
               radius = EXCLUDED.radius,
               x = EXCLUDED.x,
               y = EXCLUDED.y`,
            ...values,
          );
        }
      },
      { timeout: 60_000 },
    );
    console.log(`Seeded ${locations.length} locations from ${path}`);
  } finally {
    await prisma.$disconnect();
  }
}

function toRowValues(location: Location): (string | number)[] {
  return [
    location.id,
    location.name,
    location.type,
    location.openingHours,
    location.image,
    location.radius,
    location.coordinates.x,
    location.coordinates.y,
  ];
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
