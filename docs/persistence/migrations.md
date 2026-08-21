---
title: Persistence Migrations
id: migrations
---

# Persistence Migrations

Your adapter owns its schema. TanStack AI never inspects your tables, so you
decide the table layout and how schema changes are applied. Apply those changes
before deploying code that reads or writes the corresponding stores.

## Create tables on open, for local development

A hand-rolled adapter can create its tables the first time it opens the database.
The SQLite example in [Build your own adapter](./build-your-own-adapter) does this
behind a `migrate` flag with `CREATE TABLE IF NOT EXISTS`, so it is idempotent:

```ts ignore
import { sqlitePersistence } from './sqlite-persistence'

const persistence = sqlitePersistence({
  url: 'file:.data/state.sqlite',
  migrate: true,
})
```

This is convenient for local development and tests. Avoid request-time migrations
in production.

## Apply migrations in production

In production, run schema changes through your normal deployment workflow, not on
first request. Keep the DDL for the four tables (`messages`, `runs`,
`interrupts`, `metadata`) in a versioned migration and apply it with the same
tool you use for the rest of your database, before the new code ships.

If you build the adapter with an ORM or query builder, let that tool own the
migration journal. A Drizzle schema drives `drizzle-kit`; a Prisma models
fragment drives `prisma migrate`; a raw SQL adapter checks in plain `.sql` files.
The adapter-building skills in `@tanstack/ai-persistence` cover each of these
workflows.

## An existing schema owns its own migrations

If you map the store contracts onto tables you already have (see
[Build your own adapter](./build-your-own-adapter#existing-database-map-the-contracts-onto-your-schema)),
those tables are part of your application schema, and your existing migration tool
already owns them. Add the columns the stores need in a normal migration. Keep any
extra app-owned columns nullable or defaulted so the stores' inserts still
succeed.

## Upgrade discipline

1. Keep the DDL for the store tables in a reviewable migration, not inline in
   request handlers.
2. Back up production state where required.
3. Apply migrations before deploying code that depends on them.
4. Keep rollback and partial-deployment behavior explicit.
