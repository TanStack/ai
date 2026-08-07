---
title: Persistence Migrations
id: migrations
description: "Your adapter owns schema. Apply DDL before code that reads or writes those stores."
---

# Persistence Migrations

If you need schema changes → own them in your deployment workflow. TanStack AI never inspects your tables.

## Local development: create on open

Hand-rolled adapters can `CREATE TABLE IF NOT EXISTS` on first open. SQLite example in [Build your own adapter](./build-your-own-adapter) uses a `migrate` flag:

```ts ignore
import { sqlitePersistence } from './sqlite-persistence'

const persistence = sqlitePersistence({
  url: 'file:.data/state.sqlite',
  migrate: true,
})
```

Fine for local/tests. Avoid request-time migrations in production.

## Production: deploy migrations first

1. Keep DDL for store tables (`messages`, `runs`, `interrupts`, `metadata`, generation tables) in a versioned migration — not request handlers.
2. Apply with the same tool as the rest of your DB **before** shipping code that depends on it.
3. ORM path: Drizzle → `drizzle-kit`; Prisma → `prisma migrate`; raw SQL → checked-in `.sql`. Skills in `@tanstack/ai-persistence` cover these workflows.

## Existing schema

Mapping contracts onto tables you already have ([Build your own adapter](./build-your-own-adapter#existing-database-map-the-contracts-onto-your-schema)):

1. Add needed columns in a normal migration.
2. Keep extra app columns nullable or defaulted so store inserts succeed.
3. Your existing migration tool owns the tables.

## Upgrade checklist

1. DDL in reviewable migrations (not request handlers).
2. Back up production state where required.
3. Apply migrations before dependent code.
4. Keep rollback and partial-deployment behavior explicit.
