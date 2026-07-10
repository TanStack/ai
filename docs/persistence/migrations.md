---
title: Persistence Migrations
id: migrations
---

# Persistence Migrations

Migration ownership depends on the backend. Apply schema changes before
deploying code that reads or writes the corresponding stores.

## Drizzle SQLite

The Drizzle package bundles ordered canonical SQLite migrations. Copy them into
your repository:

```bash
pnpm exec tanstack-ai-drizzle-migrations --out migrations/tanstack-ai
```

Or print the ordered SQL:

```bash
pnpm exec tanstack-ai-drizzle-migrations --stdout
```

The CLI preserves existing identical files and refuses to overwrite divergent
files without `--force`. Apply the copied SQL using your normal SQLite,
Drizzle, or D1 deployment process.

For local Node development, the `/sqlite` factory can apply the same manifest:

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})
```

Avoid request-time migrations in production.

## Cloudflare D1

The Cloudflare package provides D1-specific migration assets:

```bash
pnpm exec tanstack-ai-cloudflare-migrations --out migrations
wrangler d1 migrations apply tanstack-ai-state --remote
```

It also exports `d1Migrations` for programmatic tooling. R2 and Durable Object
locks do not use the D1 table migration set; configure their bindings and
Durable Object migration tags in Wrangler.

## Prisma

Prisma ships a provider-neutral models fragment, then delegates SQL generation
to your application:

```bash
pnpm exec tanstack-ai-prisma-models --out prisma/schema
pnpm prisma migrate dev --name add-tanstack-ai-persistence
pnpm prisma generate
pnpm prisma migrate deploy
```

The copied fragment contains no datasource or generator. Keep those in your
application schema and commit the native migration Prisma creates for your
provider.

## Custom stores

Custom `AIPersistence` adapters own their schema and migrations entirely.
Maintain compatibility with the public store records and method semantics;
TanStack AI does not inspect your table layout.

## Upgrade discipline

1. Read the package release notes for schema changes.
2. Refresh copied assets in a reviewable branch.
3. Inspect the diff rather than using `--force` blindly.
4. Back up production state where required.
5. Apply migrations before deploying code that depends on them.
6. Keep rollback and partial-deployment behavior explicit.
