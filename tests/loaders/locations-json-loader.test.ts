import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocationsJsonLoadError,
  loadLocationsFromJson,
} from '../../src/loaders/locations-json-loader.js';

const VALID_ENTRY = {
  name: 'Mantra Restaurant',
  type: 'Restaurant',
  id: '19e1545c-8b65-4d83-82f9-7fcad4a23114',
  'opening-hours': '10:00AM-10:00PM',
  image: 'https://example.com/mantra.png',
  radius: 2,
  coordinates: 'x=2,y=2',
};

const SECOND_ENTRY = {
  ...VALID_ENTRY,
  id: '19e1545c-8b65-4d83-82f9-7fcad4a23115',
  name: 'Goji',
};

describe('loadLocationsFromJson', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'locations-loader-'));
    path = join(dir, 'locations.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads and maps valid locations', async () => {
    await writeFile(path, JSON.stringify({ locations: [VALID_ENTRY, SECOND_ENTRY] }));
    const result = await loadLocationsFromJson(path);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: VALID_ENTRY.id,
      name: VALID_ENTRY.name,
      type: VALID_ENTRY.type,
      openingHours: VALID_ENTRY['opening-hours'],
      image: VALID_ENTRY.image,
      radius: VALID_ENTRY.radius,
      coordinates: { x: 2, y: 2 },
    });
  });

  it('accepts an empty locations array', async () => {
    await writeFile(path, JSON.stringify({ locations: [] }));
    expect(await loadLocationsFromJson(path)).toEqual([]);
  });

  it('rejects a missing file with a LocationsJsonLoadError', async () => {
    await expect(loadLocationsFromJson(join(dir, 'missing.json'))).rejects.toBeInstanceOf(
      LocationsJsonLoadError,
    );
  });

  it('rejects invalid JSON', async () => {
    await writeFile(path, '{ not valid json');
    await expect(loadLocationsFromJson(path)).rejects.toBeInstanceOf(LocationsJsonLoadError);
  });

  it('rejects an unexpected root shape', async () => {
    await writeFile(path, JSON.stringify({ items: [VALID_ENTRY] }));
    await expect(loadLocationsFromJson(path)).rejects.toBeInstanceOf(LocationsJsonLoadError);
  });

  it('rejects an unknown field in an entry', async () => {
    await writeFile(path, JSON.stringify({ locations: [{ ...VALID_ENTRY, extra: 'nope' }] }));
    await expect(loadLocationsFromJson(path)).rejects.toBeInstanceOf(LocationsJsonLoadError);
  });

  it('rejects a duplicate id with a message naming the id', async () => {
    await writeFile(path, JSON.stringify({ locations: [VALID_ENTRY, { ...VALID_ENTRY }] }));
    await expect(loadLocationsFromJson(path)).rejects.toThrow(VALID_ENTRY.id);
  });

  it('loads the bundled data/locations.json without errors', async () => {
    const dataPath = join(process.cwd(), 'data', 'locations.json');
    const result = await loadLocationsFromJson(dataPath);
    expect(result.length).toBeGreaterThan(0);
    for (const location of result) {
      expect(typeof location.id).toBe('string');
      expect(location.radius).toBeGreaterThan(0);
      expect(Number.isInteger(location.coordinates.x)).toBe(true);
      expect(Number.isInteger(location.coordinates.y)).toBe(true);
    }
  });
});
