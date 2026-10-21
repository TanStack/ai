---
title: Persistence Migrations
id: migrations
---

Your persistence adapter writes to tables, and those tables need a schema change from time to time. A change that runs on the first request in production can fail under load or race between instances.

Your adapter owns its schema. TanStack AI never reads your tables, so you choose the table layout and how changes are applied. Apply each change before you deploy the code that uses it.

## Local development: create tables on open

A hand-written adapter can create its tables the first time it opens the database. The SQLite example in [Build your own adapter](./build-your-own-adapter) does this behind a `migrate` flag with `CREATE TABLE IF NOT EXISTS`, so you can run it many times:

```ts ignore
import { sqlitePersistence } from './sqlite-persistence'

const persistence = sqlitePersistence({
  url: 'file:.data/state.sqlite',
  migrate: true,
})
```

This is good for local development and tests. Do not run migrations at request time in production.

## Production: apply migrations when you deploy

1. Keep the DDL for the store tables (`messages`, `runs`, `interrupts`, `metadata`) in a versioned migration that you can review.
2. Back up the production state, if your policy requires it.
3. Apply the migration with the tool that you use for the rest of your database.
4. Deploy the code that depends on the new schema.
5. Make the rollback and partial-deploy behavior explicit.

If you build the adapter with an ORM or a query builder, let that tool own the migration history:

- A Drizzle schema uses `drizzle-kit`.
- A Prisma models fragment uses `prisma migrate`.
- A raw SQL adapter keeps plain `.sql` files in the repo.

The adapter skills in `@tanstack/ai-persistence` cover each of these workflows.

## An existing schema owns its own migrations

You can map the store contracts onto tables you already have. See [Build your own adapter](./build-your-own-adapter#existing-database-map-the-contracts-onto-your-schema).

Then those tables are part of your app schema, and your current migration tool owns them:

- Add the columns that the stores need in a normal migration.
- Keep any extra columns of your own nullable or with a default, so the inserts of the stores still work.
