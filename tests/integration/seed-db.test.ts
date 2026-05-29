import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  getTestPrisma,
  resetLocationsTable,
  TEST_DATABASE_URL,
} from '../helpers/prisma.js';

const exec = promisify(execFile);
const dbReachable = await isDatabaseReachable();

const REPO_ROOT = process.cwd();
const SEED_SCRIPT = join(REPO_ROOT, 'prisma/seed.ts');

async function runSeed(locationsPath: string): Promise<{ stdout: string; stderr: string }> {
  return exec(process.execPath, ['--import', 'tsx', SEED_SCRIPT], {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      LOCATIONS_JSON_PATH: locationsPath,
    },
    cwd: REPO_ROOT,
  });
}

const VALID_LOCATION = {
  name: 'Seed Test',
  type: 'Restaurant',
  id: '11111111-1111-4111-8111-111111111111',
  'opening-hours': '10:00AM-10:00PM',
  image: 'https://example.com/img.png',
  radius: 1,
  coordinates: 'x=1,y=1',
};

describe.skipIf(!dbReachable)('prisma/seed.ts (integration)', () => {
  const prisma = getTestPrisma();
  let workdir: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'bonial-seed-'));
    await resetLocationsTable(prisma);
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('upserts all locations from a valid JSON file', async () => {
    const path = join(workdir, 'locations.json');
    await writeFile(path, JSON.stringify({ locations: [VALID_LOCATION] }));
    await runSeed(path);
    const count = await prisma.location.count();
    expect(count).toBe(1);
  });

  it('rerunning the seed overwrites existing rows (idempotent)', async () => {
    const path = join(workdir, 'locations.json');
    await writeFile(path, JSON.stringify({ locations: [VALID_LOCATION] }));
    await runSeed(path);

    await writeFile(path, JSON.stringify({ locations: [{ ...VALID_LOCATION, name: 'Updated' }] }));
    await runSeed(path);

    const row = await prisma.location.findUnique({ where: { id: VALID_LOCATION.id } });
    expect(row?.name).toBe('Updated');
    expect(await prisma.location.count()).toBe(1);
  });

  it('fails the entire seed without writing anything when input is invalid', async () => {
    const path = join(workdir, 'locations.json');
    await writeFile(
      path,
      JSON.stringify({
        locations: [
          VALID_LOCATION,
          { ...VALID_LOCATION, id: '22222222-2222-4222-8222-222222222222', radius: -1 },
        ],
      }),
    );
    try {
      await runSeed(path);
      expect.fail('Expected seed to reject invalid input');
    } catch (error) {
      expect((error as { stderr?: string }).stderr).toContain('Validation failed');
    }
    const count = await prisma.location.count();
    expect(count).toBe(0);
  });
});
