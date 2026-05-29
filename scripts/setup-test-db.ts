import { execSync } from 'node:child_process';

const TEST_URL = 'postgresql://postgres:postgres@localhost:5435/bonial_locations_test';

const existing = execSync(
  `docker exec -i bonial-postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bonial_locations_test'"`,
  { encoding: 'utf8' },
).trim();

if (existing !== '1') {
  console.log('Creating test database...');
  execSync(
    `docker exec -i bonial-postgres psql -U postgres -d postgres -c "CREATE DATABASE bonial_locations_test"`,
    { stdio: 'inherit' },
  );
} else {
  console.log('Test database already exists.');
}

console.log('Applying migrations to test database...');
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: TEST_URL },
});
