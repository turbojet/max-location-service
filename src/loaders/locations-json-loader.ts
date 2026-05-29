import { readFile } from 'node:fs/promises';
import { locationFromInput, type Location } from '../schemas/location.js';
import { SeedFileSchema } from '../schemas/seed.js';

export class LocationsJsonLoadError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'LocationsJsonLoadError';
  }
}

export async function loadLocationsFromJson(path: string): Promise<Location[]> {
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch (error) {
    throw new LocationsJsonLoadError(
      `Failed to read locations file: ${(error as Error).message}`,
      path,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new LocationsJsonLoadError(`Invalid JSON: ${(error as Error).message}`, path);
  }

  const result = SeedFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new LocationsJsonLoadError(`Validation failed: ${issues}`, path);
  }

  const locations = result.data.locations.map(locationFromInput);

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const location of locations) {
    if (seen.has(location.id)) {
      duplicates.add(location.id);
    } else {
      seen.add(location.id);
    }
  }
  if (duplicates.size > 0) {
    throw new LocationsJsonLoadError(
      `Duplicate location ids: ${[...duplicates].sort().join(', ')}`,
      path,
    );
  }

  return locations;
}
