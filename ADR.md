# Architecture Decision Record

Design decisions for the Bonial Technical Challenge submission.

---

## ADR-001 - PostgreSQL Is the Final Source of Truth

### Context

The requirements allow the datasource choice and evaluate it. It also requests dynamic location creation through `PUT /locations/{id}`. An in-memory-only final implementation would discard written data on restart.

### Decision

The final submission requires PostgreSQL 16 as its durable source of truth. Data loaded from the supplied JSON file is initialization data; data written through PUT remains after restart.

### Consequences

- Durable writes and canonical detail reads have a clear owner.
- Local and CI setup must provide PostgreSQL, migrations, and seed instructions.
- A JSON/in-memory implementation remains useful only as a development checkpoint, not as the final deliverable.

---

## ADR-002 - Prisma for PostgreSQL Access and Migrations

### Context

The database responsibilities are ordinary location persistence and startup loading; spatial search is handled outside the ORM.

### Decision

Use Prisma 5.x for schema definition, migrations, transactions, and typed database access.

### Consequences

- CRUD and transactional seed behavior map directly to Prisma operations.
- The final runtime includes the Prisma client and PostgreSQL setup requirements.

---

## ADR-003 - In-Memory R-Tree for Spatial Search

### Context

`GET /locations/search` asks which restaurant visibility circles contain a user point. The requirements call out larger datasets and ask for technical rationale.

### Decision

Use `rbush` as an in-memory R-tree. At startup, read all locations from PostgreSQL and index each visibility circle by its bounding box. At query time, select boxes containing the user point and filter candidates using exact squared-distance containment.

The server does not listen for requests until the initial tree build has succeeded.

### Alternatives considered

- **flatbush** (static-packed R-tree, same author as rbush): faster build and query, but build-once / read-only. `PUT /locations/{id}` needs incremental insert/update.
- **KD-tree** (e.g., `kdbush`): optimized for point-in-fixed-radius queries, not for point-inside-variable-circle. An adapter loses the library's main strength.
- **PostGIS / GiST**: the appropriate choice once N or workload diversity outgrows an in-memory index (ADR-006 Path B). At this scale, the per-search DB round-trip turns microseconds into milliseconds.

Linear scan is the benchmark baseline — see README "Performance" for the measured gap.

### Consequences

- Normal search requests avoid a database round-trip.
- Memory usage grows with indexed records.
- Process-local index consistency must be handled explicitly for writes and outages.
- Performance claims will be documented only after benchmark measurement, not predicted in the ADR.

---

## ADR-004 - Raw Distance for Semantics, Rounded Distance for Output

### Context

The requirements show a five-decimal response value, but rounding before containment or sorting can change observable behavior around boundaries or near-equal distances.

### Decision

- Determine visibility using `distanceSquared <= radiusSquared`.
- Sort by unrounded `distanceSquared`; break exact ties by lexicographic `id`.
- Compute `sqrt` and round to at most five decimals only when producing response `distance`.

### Consequences

- Boundary and ordering behavior does not depend on presentation rounding.
- Deterministic ordering supports stable tests.

---

## ADR-005 - Write Consistency Through Per-Id Serialization

### Context

PUT modifies both PostgreSQL and the R-tree. Without ordering, concurrent updates to the same id can leave PostgreSQL with one version and the tree with another.

### Decision

The supported architecture is a single application instance. Serialize each location id's PUT operations with an application-level per-id mutex. Within the lock:

1. Determine whether the record exists for the response status.
2. Store the canonical value in PostgreSQL.
3. Apply the matching R-tree update.

Writes for different ids may proceed concurrently.

If the database commits but R-tree update fails, return `500` and attempt a full rebuild from PostgreSQL. If rebuild fails, mark the instance `not_ready`.

### Consequences

- Same-id writes cannot reorder database and tree updates within the supported deployment.
- Recovery behavior is defined for exceptional post-commit index failures.
- This mechanism does not solve consistency across multiple application instances.

---

## ADR-006 - Horizontal-Scale Evolution

### Context

The submission targets a single application instance (ADR-005). Multiple API instances would need consistent in-memory R-trees across processes, distributed write serialization, and shared rate-limit accounting. The requirements do not call for this, but the evolution path should be documented so the single-instance scope is an explicit choice.

### Decision

Two evolution paths are documented depending on workload shape. **Neither is implemented in the submission.**

**Path A - LISTEN/NOTIFY incremental sync (preferred for the requirements' shape).**

For the requirements' data scale ("thousands of data points" with coordinates "up to millions"), each instance can keep an eventually consistent in-memory R-tree through PostgreSQL `LISTEN/NOTIFY`:

1. PUT writes the canonical row inside a transaction.
2. The same transaction issues `NOTIFY locations_changed, <id>`.
3. Every instance subscribes via `LISTEN locations_changed`, refetches the row on receipt, and calls `index.upsert`.
4. On notification loss (connection reset or process restart), the listener triggers a full rebuild from PostgreSQL — the same recovery path already exercised after a local R-tree update failure (ADR-005). Between a committed PUT and notification delivery, other instances may briefly serve a stale index.

What else must change:

- **Write serialization** moves from the in-process per-id mutex to a PostgreSQL advisory lock (`pg_advisory_xact_lock(hashtext(id))`), which works uniformly for new and existing ids. Same-id PUTs across instances then serialize at the database.
- **Rate limiting** moves from in-process to Redis. `@fastify/rate-limit` supports a Redis store directly, so the change is configuration rather than rewrite.
- **Logging** includes an instance identifier (`HOSTNAME` or pod name) so distributed traces stay disambiguated.

**Path B - PostGIS in the database (preferred at larger N or diverse spatial workloads).**

When record counts approach tens of millions, when the workload diversifies (radius search, polygon containment, nearest-k, spatial joins), or when keeping an index in every replica's memory becomes wasteful, push spatial search into the database:

1. Store the center as `geometry(Point)` and keep `radius` separately.
2. Add an index suitable for variable-radius containment — e.g., a functional GiST on `ST_Expand(geom, radius)`, or a materialized buffered geometry column indexed by GiST. A plain GiST on `geom` alone does not prune by per-row radius.
3. Replace `index.search(point)` in `LocationService` with `WHERE ST_DWithin(geom, ST_MakePoint($1,$2), radius)` (exact filter), ordered by `geom <-> point` for ascending distance.

The HTTP contract, route validation, error envelope, auth, and OpenAPI schema do not change. Only the repository implementation and the `LocationService.search` delegation change.

### Consequences

- The submission stays focused on a working single-instance design without speculative distributed infrastructure.
- Future scale-out work has a documented, code-localized path: in Path A the search path stays in memory and the database becomes the synchronization channel; in Path B the search moves to the database and the in-memory index goes away.
- The choice depends on workload shape. Path A is lighter for the requirements' scale and keeps microsecond-scale search latency; Path B becomes appropriate once N or spatial complexity outgrows an in-memory tree per instance.

---

## ADR-007 - Strict Zod Schemas and Coordinate Boundary Serialization

### Context

The requirements represent coordinates as `"x=N,y=N"`, while calculations and database columns need numeric coordinates. Inputs should fail clearly rather than silently discard fields.

### Decision

Use Zod with `fastify-type-provider-zod`. Parse coordinates into numeric `x` and `y` at input boundaries and serialize them to the specified string at output boundaries. Validate request and seed objects strictly, rejecting unknown fields.

### Consequences

- Route validation, TypeScript types, and OpenAPI derive from shared schemas.
- Internal spatial and persistence logic operate on numbers.
- Client typos surface as `400 Bad Request` instead of being ignored.

---

## ADR-008 - Public Readiness Endpoint and Failure State

### Context

PostgreSQL is mandatory for the final implementation and is run in Docker locally and as a CI service container. A readiness endpoint makes setup and failure verification observable.

### Decision

Implement public `GET /ready`:

- `200 { "status": "ready" }` when the initialized instance is ready and a database probe succeeds.
- `503 { "status": "not_ready" }` when the probe fails or R-tree consistency recovery has failed.

No database error detail is returned to clients. Once a database failure is detected, all `/locations/*` endpoints return `503`. There is no automatic background recovery; recovery is performed through application restart after the database is healthy.

Normal R-tree search does not ping PostgreSQL per request. Search may therefore return the last known-ready snapshot during the short interval before a database outage is detected by `/ready`, detail lookup, or a write.

### Consequences

- Local Docker and CI can detect readiness with a minimal public endpoint.
- The hot search path remains independent of database request latency.
- The documented availability model is intentionally simpler than automatic self-healing.

---

## ADR-009 - In-Memory First Is a Development Checkpoint Only

### Context

Implementing spatial behavior and HTTP contracts before database integration makes early feedback possible, but ADR-001 commits the final application to PostgreSQL persistence.

### Decision

Develop in two stages:

- Phase 1 uses JSON plus an in-memory repository to validate API, R-tree, authentication, validation, and tests.
- Phase 2 replaces persistence with Prisma/PostgreSQL, adds transactional seed/startup/readiness consistency behavior, and is required for final submission.

### Consequences

- Phase 1 is runnable and useful, but must not be represented as a complete final delivery.
- Repository contract tests allow reusable behavioral verification across both implementations.

---

## ADR-010 - Repeatable, Strict, Transactional Seed Import

### Context

The supplied JSON shape is `{ "locations": [...] }`. Evaluators may rerun setup commands, and partial seed results would make application behavior unreliable.

### Decision

`prisma db seed`:

1. Parses and validates the complete input, including duplicate-id rejection, before writing.
2. Upserts locations by `id` inside one database transaction.
3. Is intended for development/evaluation reset, not ongoing production operation.

### Consequences

- Invalid input or database failure does not yield a partial seed.
- Rerunning seed is convenient but overwrites matching records, including prior PUT changes; README must state this behavior.

---

## ADR-011 - Static Client Credentials and JWT Roles

### Context

The requirements call for a token endpoint that issues a token with a role claim, but do not require user registration or persisted credentials.

### Decision

Use environment-configured static clients:

| Client   | Role    |
| -------- | ------- |
| `reader` | `read`  |
| `writer` | `write` |

`POST /auth/token` accepts strict `{ client_id, client_secret }`, uses timing-safe comparison, and returns an HS256 JWT with `sub`, `role`, `iat`, and `exp`. Client secrets are environment-held machine credentials; no password database or hashing workflow is introduced.

### Consequences

- Evaluators can obtain a token through Swagger UI without extra identity setup.
- Adding clients requires configuration and restart, acceptable for this submission scope.

---

## ADR-012 - Access Control, Rate Limiting, and Public Documentation

### Decision

| Endpoint                                       | Authentication / Authorization |
| ---------------------------------------------- | ------------------------------ |
| `POST /auth/token`                             | public                         |
| `GET /ready`, `/docs`, OpenAPI JSON            | public                         |
| `GET /locations/search`, `GET /locations/{id}` | JWT with `read` or `write`     |
| `PUT /locations/{id}`                          | JWT with `write`               |

Rate-limit PUT by authenticated token subject, default 20 requests/minute. Rate-limit token issuance by IP, default 10 requests/minute.

### Consequences

- API operations are protected while readiness and evaluation documentation remain usable without bootstrap credentials.
- Write throttling tracks the identified API client instead of conflating callers behind a shared IP.

---

## ADR-013 - PUT ID Mismatch Returns Conflict

### Context

The requirements' PUT example includes an id in both URL and request body.

### Decision

If valid UUID values differ between path and body, return `409 Conflict` with error code `ID_MISMATCH`. For a successful PUT, return `201 Created` for a new id and `200 OK` for replacement; both responses contain the canonical detail representation.

### Consequences

- Conflicting resource identity is reported rather than silently ignored.
- Same-id write serialization ensures creation/replacement status is evaluated consistently in the supported instance.

---

## ADR-014 - No Search Pagination

### Context

The requirements state that radii will not produce many returned items and specify a flat response array.

### Decision

Do not add pagination to `GET /locations/search`.

### Consequences

- The required response shape is preserved without unnecessary API additions.

---

## ADR-015 - CI Covers PostgreSQL; Deployment Is Out of Scope

### Context

The requirements call for a CI workflow, not production deployment. PostgreSQL-backed integration tests still require a database in CI.

### Decision

GitHub Actions runs install, lint, type-check, and test for pushes and pull requests using a disposable `postgres:16-alpine` service container for database integration tests. Continuous deployment and production database provisioning are outside scope.

### Consequences

- Final persistence behavior is tested without introducing unsupported deployment claims.
