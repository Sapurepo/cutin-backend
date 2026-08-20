<div align="center">

# CUTIN Backend

**The API server for CUTIN — a social journaling service where you shoot photo cuts,
compose them with templates, and share them with friends.**

[![CI](https://github.com/Sapurepo/cutin-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Sapurepo/cutin-backend/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

[한국어](./README.md) · **English**

</div>

---

> [!NOTE]
> Korean is this project's working language — commits, issues, and inline comments are
> written in Korean. Contributions in English are welcome; this document mirrors
> [`README.md`](./README.md).

## Table of contents

- [Overview](#overview)
- [Design principles](#design-principles)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project layout](#project-layout)
- [API](#api)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## Overview

CUTIN lets you shoot photo cuts, compose them into a single image with templates, and share
the result with friends who can comment and react. This repository is its **API server**.

Two clients talk to this server:

| Repository | Role |
| --- | --- |
| `cutin-ios` | Main app (SwiftUI) |
| `cutin-frontend` | Admin console (Next.js) |
| **`cutin-backend`** | **API server — this repository** |

Both clients generate their code from the OpenAPI spec this server exports. That makes
**the route schema the API contract** — changing a schema means changing both clients.

## Design principles

These decisions shape the whole codebase. Reading them first saves you from wondering
"why is it written this way?"

**Zod is the single source of truth.** One schema wrapped in `nestjs-zod`'s `createZodDto`
produces runtime validation, TypeScript types, and OpenAPI documentation together. We avoid
class-validator because it lets the spec and the runtime drift apart.

**Authentication is deny-by-default.** A global `AuthGuard` blocks every route and `@Public()`
is the only way through, so forgetting to protect a new route does not expose it. Today 44 of
49 operations are protected; the 5 public ones are health, three auth endpoints, and image
retrieval.

**Errors have exactly one shape.** Every failure responds with
`{ error: { code, message, details? } }`, and clients branch on `code`. Domain code throws
`AppError` and a global filter converts it.

**One domain, one module.** Dependencies between modules are declared through
`imports`/`exports`. A cycle fails at boot, which is the signal to revisit the boundary.

**Infrastructure lives behind interfaces.** Storage and push have no chosen vendor yet, so they
are injected via symbol tokens (`STORAGE`, `OAUTH_VERIFIER`). Domain code never calls a vendor
SDK directly, and tests swap implementations with `overrideProvider`.

**The server does not compose images.** The client composes the N-cut image; the server stores
both the N original cuts and the composed result.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | NestJS 11 (Fastify adapter) |
| Validation & docs | Zod + `nestjs-zod` + `@nestjs/swagger` |
| Database | PostgreSQL 16 + Drizzle ORM |
| Jobs & scheduling | pg-boss (Postgres-backed, no Redis) |
| Testing | Vitest + Testcontainers |
| Lint & format | Biome |
| Runtime | Node 22, TypeScript 5.9 (ESM), pnpm |

<details>
<summary><b>Constraints this combination imposes</b> — read before touching the build setup</summary>

NestJS resolves dependencies by reading `design:paramtypes` metadata at runtime. Three things
follow from that:

1. It needs `experimentalDecorators` + `emitDecoratorMetadata`, which means
   **`erasableSyntaxOnly` and `verbatimModuleSyntax` cannot be used.**
2. esbuild does not support `emitDecoratorMetadata`, so the dev and test transformer is
   **SWC** — not `tsx`, and Vitest goes through `unplugin-swc`.
3. TypeScript 7 packages no longer ship the compiler's JS API, which breaks
   `@swc-node/register` — so **TypeScript is pinned to 5.9**.

</details>

## Getting started

### Requirements

- **Node.js 22** or newer
- **pnpm** — the version is pinned in `packageManager`, so `corepack enable` is recommended
- **Docker** — for the local Postgres and for Testcontainers during tests

### Install and run

```bash
git clone https://github.com/Sapurepo/cutin-backend.git
cd cutin-backend

pnpm install
cp .env.example .env      # the defaults work locally as-is
docker compose up -d      # PostgreSQL 16

pnpm db:migrate           # apply the schema
pnpm db:seed              # templates and frames — without these you cannot create a post
pnpm dev
```

- API — <http://localhost:3000>
- Swagger UI — <http://localhost:3000/docs>

> [!NOTE]
> Skipping `pnpm db:seed` leaves you with no templates, and every post creation will fail.
> Change the port with `PORT` in `.env`.

## Environment variables

`src/config/env.ts` parses them with Zod, and **boot fails when a required value is missing.**
It never silently falls back to a default.

| Variable | Required | Description |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | 32+ characters. `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | ✅ | Verifies the audience of the Google OAuth `id_token` |
| `PUBLIC_BASE_URL` | ✅ | The server's own public address (upload target, share links) |
| `MEDIA_BASE_URL` | | URL prefix for media served to clients. Falls back to `PUBLIC_BASE_URL` |
| `STORAGE_DIR` | | Local disk storage path (to be removed once a vendor is chosen) |
| `HOST` · `PORT` · `LOG_LEVEL` · `NODE_ENV` | | Have defaults |
| `APNS_KEY_ID` · `APNS_TEAM_ID` · `APNS_PRIVATE_KEY` · `APNS_BUNDLE_ID` | | See below |

The four APNs values must be **either all set or all empty.** Setting only some of them fails
the boot on purpose — it prevents the "I configured push and nothing arrives" class of bug.
When all four are empty the service falls back to a logging implementation, so local
development is unaffected.

## Project layout

```
src/
  main.ts                    bootstrap (NestFactory + FastifyAdapter)
  appModule.ts               root module — global Guard/Pipe/Interceptor/Filter are wired here
  appSetup.ts                configuration that must touch the Fastify instance directly
  openapi.ts                 OpenAPI document assembly
  config/env.ts              environment parsing with Zod
  db/
    schema/                  Drizzle table definitions (one file per domain)
    migrations/              generated by drizzle-kit — never edited by hand
  modules/<domain>/
    <domain>Module.ts        declares its dependencies through imports
    <domain>Controller.ts    HTTP concerns only — never writes queries
    <domain>Service.ts       domain rules — knows nothing about HTTP
    <domain>Repository.ts    Drizzle queries — knows nothing about domain rules
    <domain>Schemas.ts       Zod schemas + createZodDto wrappers
  shared/                    only what more than one domain uses
  jobs/                      pg-boss schedules and job bodies
test/                        route-level integration tests
```

Not every domain needs all five files. A thin repository may be folded into the service, but
**controllers never write queries.** Shared code moves into `shared/` when a second caller
appears — not before.

Jobs take `now` as an argument so tests can inject a timestamp and call them directly without
standing up the queue.

## API

38 paths, 49 operations. Start the server and try them from `/docs`.

| Group | Ops | Contents |
| --- | :---: | --- |
| `auth` | 3 | OAuth sign-in, token refresh, sign-out |
| `users` | 6 | Profile, onboarding, settings |
| `posts` | 12 | Drafts, publishing, feed, templates, frames |
| `social` | 10 | Follow, friends (mutual follow), block, search, suggestions |
| `media` | 4 | Upload and retrieval |
| `comments` · `reactions` | 5 | Comments and reactions |
| `bookmarks` | 2 | Saved posts |
| `notifications` · `devices` | 5 | In-app notifications, device registration |
| `reports` | 1 | Reporting |
| `system` | 1 | Health check |

```bash
pnpm openapi:export   # writes openapi.json — the input for client codegen
```

> [!IMPORTANT]
> Changing a route schema changes the generated code in both clients. Error `code` values in
> particular are what clients branch on, so treat them as a stable contract.

## Development

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server with restart on change |
| `pnpm build` / `pnpm start` | Production build / run |
| `pnpm lint` / `pnpm lint:fix` | Biome check / autofix |
| `pnpm format` | Biome formatting |
| `pnpm typecheck` | Type checking |
| `pnpm test` / `pnpm test:watch` | Tests |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed templates and frames |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm openapi:export` | Produce `openapi.json` |

Before wrapping up, make these three pass. CI runs the same ones.

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### Coding conventions

- **Files and folders use camelCase** (`postsService.ts`). No kebab-case
- **Relative imports carry the `.ts` extension** (`./appError.ts`);
  `rewriteRelativeImportExtensions` rewrites them to `.js` at build time
- **Never use `import type` for a class that is injected or used as a parameter type.**
  If only the type survives, `design:paramtypes` comes back empty, injection breaks silently,
  and DTO validation is skipped entirely. This is why Biome's `useImportType` rule is disabled
- No enums, no namespaces. Enumerated values are union types plus an `as const` array

## Testing

The suite is route-level and integration-first: real HTTP requests against a real Postgres,
with mocking kept to a minimum.

```bash
pnpm test          # Docker must be running
```

Testcontainers starts Postgres for you, so there is nothing to set up. Only outbound
dependencies — storage and push — are swapped through their tokens.

> [!WARNING]
> Tests do not go through `setupOpenapi`, so **the Swagger UI path is never exercised.**
> If you touch dependencies, boot the app once with `pnpm dev`: removing `@fastify/static`
> once left lint, typecheck, and tests all green while the app itself failed to start.

## Contributing

Issues and pull requests are welcome.

### Before you start

- **Open an [issue](https://github.com/Sapurepo/cutin-backend/issues) first** for bugs and
  feature ideas. If it is an API request coming from a client, describing the request and
  response shape you want helps a lot
- For larger changes, agreeing on direction in the issue before writing code saves everyone time

### Workflow

1. Branch off `dev` — `feature/…`, `fix/…`, `docs/…`, `refactor/…`
2. Make the change **with tests.** For a bug fix, write the reproducing test first, then fix it
3. Make `pnpm lint && pnpm typecheck && pnpm test` pass
4. Open a pull request against `dev`. CI runs the same checks again

### Commit messages

The format is `[TYPE] what changes and why`. TYPE is one of `FEATURE`, `FIX`, `REFACTOR`,
`DOCS`, `SETUP`, `UPDATE`. Subjects are written in Korean; English is fine for contributions
in English.

```
[FEATURE] 프로필 목록은 고정을 맨 앞에 둔다 — 커서가 (pinned, publishedAt) 복합키가 된다
```

Write the subject as **what becomes different**, not what you did. When a decision needed
judgement, leave the reasoning in the body — the next person to touch that code will read it.

### What review looks at

- Every changed line traces back to the issue or the stated purpose (unrelated cleanup belongs
  in its own PR)
- New behaviour comes with tests
- If a route schema changed, the PR describes the impact on clients
- The change matches the surrounding style and comment density

## Documentation

Project documentation is written in Korean.

| Document | Contents |
| --- | --- |
| [`CUTIN-FEATURES.md`](./CUTIN-FEATURES.md) | Product feature specification |
| [`CLAUDE.md`](./CLAUDE.md) | Architecture conventions and settled domain policies |
| [`docs/deployment.md`](./docs/deployment.md) | Deployment runbook and pre-launch traps |
| [`docs/infraVendors.md`](./docs/infraVendors.md) | Infrastructure vendor comparison |
| [`docs/clientEnvironments.md`](./docs/clientEnvironments.md) | Client build configurations and domains |
| [`docs/appleAccount.md`](./docs/appleAccount.md) | Apple account and APNs key procedures |

## License

[MIT](./LICENSE) © Sapu
