/**
 * Generate a synthetic locations JSON file matching the required input schema.
 *
 * Env vars (all optional):
 *   GEN_N           Number of rows (default 100000)
 *   GEN_COORD_MAX   Coordinate upper bound, exclusive (default 23000)
 *   GEN_RADIUS_MAX  Radius upper bound, inclusive (default 99)
 *   GEN_OUT         Output path (default data/locations_huge.json)
 *
 * Average hits per random query ≈ N · π · E[r²] / S². For defaults this is
 * ≈ 2, so Swagger queries return a useful (non-empty, non-overwhelming)
 * number of locations.
 */

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const N = Number(process.env.GEN_N ?? 100_000);
const COORD_MAX = Number(process.env.GEN_COORD_MAX ?? 23_000);
const RADIUS_MAX = Number(process.env.GEN_RADIUS_MAX ?? 99);
const OUT = process.env.GEN_OUT ?? 'data/locations_huge.json';

type Row = {
  name: string;
  type: 'Restaurant';
  id: string;
  'opening-hours': string;
  image: string;
  radius: number;
  coordinates: string;
};

function generate(): Row[] {
  const rows = new Array<Row>(N);
  for (let i = 0; i < N; i += 1) {
    rows[i] = {
      name: `Location #${i}`,
      type: 'Restaurant',
      id: randomUUID(),
      'opening-hours': '10:00AM-10:00PM',
      image: 'https://example.com/img.png',
      radius: 1 + Math.floor(Math.random() * RADIUS_MAX),
      coordinates: `x=${Math.floor(Math.random() * COORD_MAX)},y=${Math.floor(Math.random() * COORD_MAX)}`,
    };
  }
  return rows;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const rows = generate();
  const json = JSON.stringify({ locations: rows });
  await writeFile(OUT, json);
  const ms = (performance.now() - t0).toFixed(0);
  const sizeMb = (json.length / 1_048_576).toFixed(2);
  const expectedHits = ((N * Math.PI * ((RADIUS_MAX * (RADIUS_MAX + 1) * (2 * RADIUS_MAX + 1)) / (6 * RADIUS_MAX))) / (COORD_MAX * COORD_MAX)).toFixed(2);
  console.log(`Wrote ${N} rows to ${OUT} (${sizeMb} MB) in ${ms} ms`);
  console.log(`  Coord range: 0..${COORD_MAX - 1}, radius: 1..${RADIUS_MAX}`);
  console.log(`  Expected hits per random query: ≈ ${expectedHits}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
