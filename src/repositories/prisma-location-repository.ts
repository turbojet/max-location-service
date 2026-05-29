import { Prisma, type PrismaClient } from '@prisma/client';
import { DatabaseUnavailableError, isDatabaseOutage } from '../errors/database-error.js';
import type { Location } from '../schemas/location.js';
import type { CreateOrReplaceResult, LocationRepository } from './location-repository.js';

type LocationRow = {
  id: string;
  name: string;
  type: string;
  openingHours: string;
  image: string;
  radius: number;
  x: number;
  y: number;
};

export class PrismaLocationRepository implements LocationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Location[]> {
    const rows = await this.guard(() => this.prisma.location.findMany({ orderBy: { id: 'asc' } }));
    return rows.map(rowToLocation);
  }

  async findById(id: string): Promise<Location | null> {
    const row = await this.guard(() => this.prisma.location.findUnique({ where: { id } }));
    return row ? rowToLocation(row) : null;
  }

  async createOrReplace(location: Location): Promise<CreateOrReplaceResult> {
    return this.guard(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existed = (await tx.location.findUnique({ where: { id: location.id } })) !== null;
          const data = locationToData(location);
          const saved = await tx.location.upsert({
            where: { id: location.id },
            create: data,
            update: data,
          });
          return {
            status: existed ? ('replaced' as const) : ('created' as const),
            location: rowToLocation(saved),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isDatabaseOutage(err)) {
        throw new DatabaseUnavailableError('Database is unavailable', err);
      }
      throw err;
    }
  }
}

function rowToLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    openingHours: row.openingHours,
    image: row.image,
    radius: row.radius,
    coordinates: { x: row.x, y: row.y },
  };
}

function locationToData(location: Location): LocationRow {
  return {
    id: location.id,
    name: location.name,
    type: location.type,
    openingHours: location.openingHours,
    image: location.image,
    radius: location.radius,
    x: location.coordinates.x,
    y: location.coordinates.y,
  };
}
