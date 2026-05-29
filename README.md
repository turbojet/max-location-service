# Bonial Restaurant Locations API

Spatial restaurant search and management API for the Bonial Technical Challenge.

> For a one-page orientation (what was built, trade-offs, what is out of scope), see [`SUBMISSION.md`](./SUBMISSION.md).

- **Stack:** Node.js 20+, TypeScript, Fastify 5, Prisma + PostgreSQL 16, rbush (in-memory R-tree).
- **Search:** R-tree bounding-box pre-filter, exact distance² check, sorted by ascending distance.
- **Persistence:** PostgreSQL is the source of truth. The R-tree is rebuilt from the database at startup and kept consistent on each PUT.
- **Auth:** Static `reader`/`writer` clients via `POST /auth/token`, HS256 JWT with `role` claim.
- **Docs:** OpenAPI 3 + Swagger UI at `/docs`.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment (DATABASE_URL is required for the next steps)
cp .env.example .env   # adjust secrets if you like

# 3. Start Postgres (uses host port 5435 to avoid colliding with any
#    Postgres you already run on 5432)
npm run db:up

# 4. Apply migrations
npm run db:migrate

# 5. Seed the supplied dataset
npm run db:seed

# 6. Run the API
npm run dev
```

> **Before running `npm test`** (one-time, after `npm run db:up`):
>
> ```bash
> npm run db:test:setup    # creates the test database if missing and applies migrations
> ```

Visit `http://localhost:3000/docs` for the Swagger UI.

### Get a token, then search

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/token \
  -H 'content-type: application/json' \
  -d '{"client_id":"reader","client_secret":"reader-dev-secret"}' \
  | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/locations/search?x=3&y=2' | jq .
```

## Scripts

| Command                     | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`               | Run with hot reload via `tsx watch`                                                         |
| `npm test`                  | Unit + integration test suite (Postgres-backed tests auto-skip if DB unreachable)           |
| `npm run lint`              | ESLint flat config                                                                          |
| `npm run typecheck`         | `tsc --noEmit`                                                                              |
| `npm run db:up` / `db:down` | docker-compose Postgres lifecycle                                                           |
| `npm run db:migrate`        | `prisma migrate deploy` (idempotent)                                                        |
| `npm run db:seed`           | Transactional seed from `LOCATIONS_JSON_PATH` (default `data/locations.json`)               |
| `npm run db:reset`          | Drop, re-create, migrate, and re-seed                                                       |
| `npm run db:test:setup`     | Prepare the test database: create `bonial_locations_test` if missing and apply migrations   |
| `npm run bench`             | rbush vs. linear-scan benchmark over `data/locations_big.json`                              |
| `npm run gen:data`          | Generate a synthetic seed JSON (env: `GEN_N`, `GEN_COORD_MAX`, `GEN_RADIUS_MAX`, `GEN_OUT`) |

## API surface

| Endpoint                      | Auth                   | Role          | Notes                                            |
| ----------------------------- | ---------------------- | ------------- | ------------------------------------------------ |
| `POST /auth/token`            | none (IP rate-limited) | —             | Returns `{access_token, token_type, expires_in}` |
| `GET /ready`                  | none                   | —             | `{status: "ready" \| "not_ready"}`               |
| `GET /docs`                   | none                   | —             | Swagger UI                                       |
| `GET /locations/search?x=&y=` | Bearer                 | read or write | Sorted by ascending distance                     |
| `GET /locations/{id}`         | Bearer                 | read or write | Canonical detail                                 |
| `PUT /locations/{id}`         | Bearer                 | write         | Per-id mutex; rate-limited by `sub`              |

Errors use a single envelope: `{error: {code, message, details?}}`.

## Design decisions

The submission ships a full Architecture Decision Record in [`ADR.md`](./ADR.md). Highlights:

- **R-tree via rbush (ADR-003).** Each restaurant is indexed by the bounding box of its visibility circle, so a search runs as `rbush.search(pointBox)` → exact distance² filter. Sorted by `distanceSquared`; `sqrt` runs only at HTTP serialization.
- **PostgreSQL is the source of truth (ADR-001/009).** The in-memory R-tree is a derived view rebuilt from the database at startup. A PUT writes to the database first, then updates the R-tree incrementally; an R-tree update failure triggers a full rebuild from the database. If the rebuild also fails, readiness flips to `not_ready` and the process awaits restart (no background reconnect loop).
- **Per-id mutex for write consistency (ADR-005).** Same-id PUTs serialize; different-id PUTs run concurrently. Readiness is re-checked both before entering the mutex and inside it, so queued writes cannot land after the process is already degraded.
- **PostGIS as the horizontal-scale evolution (ADR-006).** Single-instance is fine for the requirements; multi-instance consistency belongs in the database via `GEOMETRY` with a variable-radius spatial index.
- **Strict zod schemas at the HTTP boundary (ADR-007).** Coordinate strings (`x=N,y=N`) are parsed on the way in and serialized on the way out; internal code only sees numeric `{x, y}`.
- **Static client credentials (ADR-011).** Env-held machine credentials with timing-safe comparison. No password store.

## Performance

The requirements allow coordinates "up to millions" with "thousands" of data points, so the benchmark covers both that target scenario and stress sizes well beyond it. Random query points across the full coordinate range; 100–500 warmup + 500–2000 measured iterations.

| Scenario                            |         N |  Coord range |   rbush mean / p99 |    linear mean / p99 |    Ratio |  Build |
| ----------------------------------- | --------: | -----------: | -----------------: | -------------------: | -------: | -----: |
| Dense sample (`locations_big.json`) |    10 000 |    0..10 000 |  1.94 µs / 4.92 µs |  17.08 µs / 22.00 µs |     ≈ 9× |   5 ms |
| **Required — coords to 1 M**        |    10 000 | 0..1 000 000 |  0.98 µs / 1.75 µs |  13.68 µs / 15.71 µs |    ≈ 14× |   7 ms |
| **Required — coords to 5 M**        |    10 000 | 0..5 000 000 |  1.29 µs / 5.58 µs |  20.48 µs / 33.92 µs |    ≈ 16× |   6 ms |
| Stress (150× required N)            | 1 500 000 | 0..1 000 000 | 2.97 µs / 11.17 µs | 7 573 µs / 10 217 µs | ≈ 2 550× | 1.27 s |
| Stress (150× N, coords to 5 M)      | 1 500 000 | 0..5 000 000 |  2.57 µs / 9.54 µs |  3 734 µs / 8 795 µs | ≈ 1 450× | 1.27 s |

Two observations worth noting:

- **Larger coordinate ranges widen rbush's lead.** With the wider plane allowed by the requirements the data becomes sparser, so bounding-box pruning rejects almost all of the index per query. rbush mean stays around 1 µs while linear scan stays proportional to N.
- **rbush grows much more slowly than linear scan as N increases.** In these benchmark datasets, multiplying N by 150 slows the index by ~2–3× while linear scan slows by ~200–500×. At 1.5 M rows the per-query gap is over a thousand fold on this distribution.

Reproduce with:

```bash
npm run bench                                                       # default: data/locations_big.json
BENCH_SYNTHETIC_N=10000   BENCH_COORD_MAX=5000000 npm run bench     # requirements scenario
BENCH_SYNTHETIC_N=1500000 BENCH_COORD_MAX=5000000 NODE_OPTIONS='--max-old-space-size=8192' npm run bench   # stress
```

Hardware: Apple M-series, Node 20. Each row is a representative run; exact numbers vary by hardware and random seed, but the order-of-magnitude gap and scaling trend reproduce.

## Seeding behavior

`npm run db:seed` validates the entire input file (including duplicate-id rejection) **before** writing, then upserts every row in a single transaction. Re-running the seed is idempotent at the row level — it overwrites matching ids with the JSON values, including any prior PUT changes. Use `npm run db:reset` for a clean slate.

## Testing

`npm test` runs ~170 tests covering schemas, repositories (in-memory and Postgres-backed), the spatial index, services, routes, auth flow, error handling, the seed script (transactional rollback on invalid input), and end-to-end flows against a real database. Integration tests that need Postgres probe the DB at suite load and skip cleanly when it isn't reachable, so a unit-only `npm test` works without Docker.

Integration tests target a dedicated `bonial_locations_test` database (set via `TEST_DATABASE_URL`) so they never wipe the dev data in `bonial_locations`. Run `npm run db:test:setup` once after `npm run db:up` to prepare it — creates the database if missing and applies migrations.

CI (`.github/workflows/ci.yml`) brings up a disposable `postgres:16-alpine` service container, creates the test database, applies migrations to both, then runs the full suite.

## Environment

See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `AUTH_READER_SECRET`, `AUTH_WRITER_SECRET`. `JWT_TTL` accepts `30s|10m|1h|1d` or bare positive seconds and is validated against the safe-integer range.

## Production evolution

For horizontal-scale evolution paths (LISTEN/NOTIFY incremental sync vs PostGIS in the database), see [ADR-006](./ADR.md#adr-006---horizontal-scale-evolution). Neither is implemented here.
