# Submission Notes — Bonial Restaurant Locations API

Setup and scripts: [`README.md`](./README.md). Design decisions: [`ADR.md`](./ADR.md).

## What I built

A Fastify-on-Node.js (TypeScript) API serving the three required location endpoints (`GET /locations/search`, `GET /locations/{id}`, `PUT /locations/{id}`) plus `POST /auth/token`. Spatial search runs in-memory through an rbush R-tree; PostgreSQL 16 is the durable source of truth. Requests and responses are validated by Zod schemas, which also feed the OpenAPI specification rendered through Swagger UI at `/docs`. JWT carries a `role` claim, writes and token issuance are rate-limited, and errors share a single envelope.

GitHub Actions CI runs lint, type-check, and the full test suite (~170 tests) against a real `postgres:16-alpine` service container.

## Key trade-offs

- **PostgreSQL as the source of truth** (ADR-001). The requirements let us pick the datasource and explicitly evaluate that choice. The PUT endpoint creates dynamic data that has to survive restarts, so an in-memory-only design would silently lose every write. Postgres holds the canonical state; the R-tree is a derived in-memory view rebuilt from it at startup and kept consistent on each PUT.
- **rbush R-tree for the hot search path, not PostGIS** (ADR-003, ADR-006). The required data shape fits comfortably in memory and `GET /locations/search` does not touch the database. Benchmarks: ~1 µs mean at the required scale, ~3 µs at 1.5 M synthetic rows. PostGIS becomes the better choice when horizontal scaling or spatial workload diversity demands it — documented as the evolution path, not shipped. The PostGIS sketch in ADR-006 reflects research, not hands-on experience; I have not deployed PostGIS in practice.
- **Per-id mutex for write consistency** (ADR-005). Same-id PUTs serialize through an in-process mutex; different-id PUTs run concurrently. Defined recovery on post-commit index-update failure: full rebuild from PostgreSQL, else `/ready` flips to 503 and the process awaits restart.
- **Static client credentials with JWT roles** (ADR-011). The requirements call for a token endpoint with a role claim, not user management. Env-held secrets, timing-safe comparison, HS256.

## Out of scope

- **Multi-instance scale-out.** Outside the requirements. ADR-006 documents two paths (LISTEN/NOTIFY + advisory locks vs PostGIS); neither is implemented.
- **Search result caching.** The rbush path is microsecond-scale per query; caching would add invalidation complexity without a clear benefit at this scale.
- **Refresh tokens, fine-grained RBAC, password store.** Not requested. Two static client roles cover the requirements.
- **Production deployment, container registry push.** The requirements call for CI only (ADR-015). docker-compose covers evaluator setup; live deployment would be optimizing for a thing the requirements do not ask for.

## If this were going to production

- **Observability**: metrics and traces beyond the current request logs.
- **Connection pooling**: PgBouncer if horizontal scaling lands.
- **Distributed write serialization and rate limiting** (ADR-006 Path A).
- **CI/CD**: image build and environment promotion.

## Where to look first

| Area                        | File                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| Routes                      | `src/routes/locations.ts`, `src/routes/auth.ts`, `src/routes/ready.ts` |
| Service / write consistency | `src/services/location-service.ts`                                     |
| Spatial index               | `src/spatial/spatial-index.ts`                                         |
| Per-id mutex                | `src/utils/per-id-mutex.ts`                                            |
| Repository (Postgres)       | `src/repositories/prisma-location-repository.ts`                       |
| Repository contract         | `src/repositories/location-repository.ts`                              |
| Design decisions            | `ADR.md`                                                               |
| Benchmark                   | `npm run bench` — see README "Performance"                             |
