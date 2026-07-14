---
title: Persistence Migrations
id: migrations
---

# Persistence Migrations

Migration ownership depends on the backend. Apply schema changes before
deploying code that reads or writes the corresponding stores.

AG-UI interrupts add atomic batch state. Every backend must persist the
descriptor and protected binding set, generation, exact ID set, canonical
submission fingerprint, committed resolutions, continuation run ID, and
accepted/commit timestamps. Runs also need current/parent correlation for the
compare-and-swap that creates a continuation. Add uniqueness for one generation
of an interrupted run and indexes for pending recovery lookups.

Do not approximate this with sequential interrupt rows. A partial write can
expose an interrupt that cannot be resumed safely. See
[Custom stores](./custom-stores) for the atomic capability and
[Interrupts](../chat/interrupts) for the lifecycle.

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

Refresh the manifest to pick up the interrupt batch table/columns, generation
and pending-recovery indexes, submission fingerprint uniqueness, continuation
receipt, and parent-run correlation. Review the generated SQL before applying
it to every SQLite environment.

For local Node development, the `/sqlite` factory can apply the same manifest:

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})
```

Avoid request-time migrations in production.

Projects that already run drizzle-kit can skip the bundled SQL entirely: emit
the schema module with `tanstack-ai-drizzle-schema`, add it to your drizzle-kit
schema paths, and let your own journal generate the DDL. See
[Own the schema](./drizzle#own-the-schema). Pick one DDL owner per database —
bundled SQL or your journal, not both.

## Cloudflare D1

The Cloudflare package provides D1-specific migration assets:

```bash
pnpm exec tanstack-ai-cloudflare-migrations --out migrations
wrangler d1 migrations apply tanstack-ai-state --remote
```

It also exports `d1Migrations` for programmatic tooling. R2 and Durable Object
locks do not use the D1 table migration set; configure their bindings and
Durable Object migration tags in Wrangler.

The D1 migration set carries the same atomic interrupt fields and indexes as
Drizzle SQLite. Apply it before deploying Workers that can emit native
interrupts. A Durable Object lock can serialize workers, but it does not replace
the D1 compare-and-swap or accepted receipt.

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

The updated fragment adds the models and fields needed for atomic interrupt
batches, bindings, generations, fingerprints, accepted receipts, continuation
runs, and parent/current-run correlation. The package does **not** ship SQL for
your provider. Generate and deploy your own Prisma migration before using the
new package version:

```bash
pnpm exec tanstack-ai-prisma-models --out prisma/schema
pnpm prisma migrate dev --name add-ag-ui-interrupts
pnpm prisma generate
pnpm prisma migrate deploy
```

Inspect and commit the migration that Prisma generates. Do not deploy the
runtime first or rely on `prisma db push` as a production migration.

## Custom stores

Custom `AIPersistence` adapters own their schema and migrations entirely.
Maintain compatibility with the public store records and method semantics;
TanStack AI does not inspect your table layout.

For this upgrade, add one transaction boundary spanning exact-set validation,
generation compare-and-swap, resolution persistence, continuation receipt, and
run-parent linkage. Preserve committed fingerprints long enough for exact retry
replay and recovery after a browser accepted-tombstone cleanup failure.

## Upgrade discipline

1. Read the package release notes for schema changes.
2. Refresh copied assets in a reviewable branch.
3. Inspect the diff rather than using `--force` blindly.
4. Back up production state where required.
5. Apply migrations before deploying code that depends on them.
6. Keep rollback and partial-deployment behavior explicit.
