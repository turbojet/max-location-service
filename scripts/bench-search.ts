/**
 * Microbenchmark: rbush-accelerated search vs linear scan. Two modes:
 *   - Default: reads data/locations_big.json (10,000 rows).
 *   - Synthetic: set BENCH_SYNTHETIC_N to generate N points in-memory
 *     across a configurable coordinate range. Useful for stress-testing
 *     beyond what fits comfortably in a committed JSON file.
 *
 * Examples:
 *   npx tsx scripts/bench-search.ts
 *   BENCH_SYNTHETIC_N=1500000 BENCH_COORD_MAX=1000000 npx tsx scripts/bench-search.ts
 */

import { randomUUID } from 'node:crypto';
import { loadLocationsFromJson } from '../src/loaders/locations-json-loader.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';
import type { Coordinates } from '../src/schemas/coordinates.js';
import type { Location } from '../src/schemas/location.js';

const JSON_PATH = process.env.BENCH_JSON ?? 'data/locations_big.json';
const QUERY_COUNT = Number(process.env.BENCH_QUERIES ?? 1000);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 100);
const SYNTHETIC_N = process.env.BENCH_SYNTHETIC_N
  ? Number(process.env.BENCH_SYNTHETIC_N)
  : null;
const COORD_MAX = Number(process.env.BENCH_COORD_MAX ?? 10_000);
const RADIUS_MAX = Number(process.env.BENCH_RADIUS_MAX ?? 100);

type BenchResult = {
  label: string;
  iterations: number;
  totalMs: number;
  meanUs: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
};

function bench(label: string, iterations: number, fn: () => unknown): BenchResult {
  for (let i = 0; i < WARMUP; i += 1) fn();
  const samples = new Float64Array(iterations);
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const s = performance.now();
    fn();
    samples[i] = performance.now() - s;
  }
  const totalMs = performance.now() - t0;
  const sorted = Array.from(samples).sort((a, b) => a - b);
  const pct = (p: number): number => sorted[Math.floor(sorted.length * p)] ?? 0;
  return {
    label,
    iterations,
    totalMs,
    meanUs: (totalMs / iterations) * 1000,
    p50Us: pct(0.5) * 1000,
    p95Us: pct(0.95) * 1000,
    p99Us: pct(0.99) * 1000,
  };
}

function linearSearch(locations: Location[], point: Coordinates): { id: string; d2: number }[] {
  const hits: { id: string; d2: number }[] = [];
  for (const loc of locations) {
    const dx = loc.coordinates.x - point.x;
    const dy = loc.coordinates.y - point.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= loc.radius * loc.radius) {
      hits.push({ id: loc.id, d2 });
    }
  }
  hits.sort((a, b) => a.d2 - b.d2);
  return hits;
}

function randomPoint(xMin: number, xMax: number, yMin: number, yMax: number): Coordinates {
  return {
    x: Math.floor(xMin + Math.random() * (xMax - xMin)),
    y: Math.floor(yMin + Math.random() * (yMax - yMin)),
  };
}

function fmt(r: BenchResult): string {
  return `${r.label.padEnd(16)} iters=${r.iterations}  mean=${r.meanUs.toFixed(2)}µs  p50=${r.p50Us.toFixed(2)}µs  p95=${r.p95Us.toFixed(2)}µs  p99=${r.p99Us.toFixed(2)}µs`;
}

function generateSyntheticLocations(n: number, coordMax: number, radiusMax: number): Location[] {
  const out: Location[] = new Array<Location>(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = {
      id: randomUUID(),
      name: `Loc#${i}`,
      type: 'Restaurant',
      openingHours: '10:00AM-10:00PM',
      image: 'https://example.com/img.png',
      radius: 1 + Math.floor(Math.random() * radiusMax),
      coordinates: {
        x: Math.floor(Math.random() * coordMax),
        y: Math.floor(Math.random() * coordMax),
      },
    };
  }
  return out;
}

async function main(): Promise<void> {
  let locations: Location[];
  if (SYNTHETIC_N !== null) {
    console.log(`Generating ${SYNTHETIC_N} synthetic locations (coord 0..${COORD_MAX}, radius 1..${RADIUS_MAX})...`);
    const t0 = performance.now();
    locations = generateSyntheticLocations(SYNTHETIC_N, COORD_MAX, RADIUS_MAX);
    console.log(`Generated in ${(performance.now() - t0).toFixed(2)}ms.`);
  } else {
    console.log(`Loading ${JSON_PATH}...`);
    locations = await loadLocationsFromJson(JSON_PATH);
    console.log(`Loaded ${locations.length} locations.`);
  }

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const l of locations) {
    if (l.coordinates.x < xMin) xMin = l.coordinates.x;
    if (l.coordinates.x > xMax) xMax = l.coordinates.x;
    if (l.coordinates.y < yMin) yMin = l.coordinates.y;
    if (l.coordinates.y > yMax) yMax = l.coordinates.y;
  }
  console.log(`Coord range: x=[${xMin}, ${xMax}]  y=[${yMin}, ${yMax}]`);

  const buildStart = performance.now();
  const index = new SpatialIndex(locations);
  const buildMs = performance.now() - buildStart;
  console.log(`SpatialIndex built in ${buildMs.toFixed(2)}ms (size=${index.size()})`);

  const points: Coordinates[] = [];
  for (let i = 0; i < QUERY_COUNT; i += 1) {
    points.push(randomPoint(xMin, xMax, yMin, yMax));
  }
  let idx = 0;
  const next = (): Coordinates => points[idx++ % QUERY_COUNT] as Coordinates;

  console.log();
  console.log(fmt(bench('rbush search', QUERY_COUNT, () => index.search(next()))));
  console.log(fmt(bench('linear scan', QUERY_COUNT, () => linearSearch(locations, next()))));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
