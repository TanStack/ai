---
title: Persistence Migrations
id: migrations
---

Run persistence migrations when you deploy a packaged SQL, ORM, or Cloudflare
backend. The default is production-safe: packaged backends do not create tables
unless you opt in with `migrate: true` or run generated DDL through your own
migration system.

By the end, you can generate the right migration file for each adapter and know
when lazy migration is appropriate.

## Use lazy migration only for local development

Pass `migrate: true` when a local or development database should create the
TanStack AI tables on first use.

```ts
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

export const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
  migrate: true,
})
```

For production, leave `migrate` unset or set it to `false`, generate a migration
file, review it, and apply it before traffic uses the persistence stores.

## Generic SQL migrations

Use the generic SQL CLI for SQLite, Postgres, or MySQL DDL.

```sh
pnpm exec tanstack-ai-persistence-sql --dialect sqlite --out migrations/001_tanstack_ai.sql
pnpm exec tanstack-ai-persistence-sql --dialect postgres --stdout
pnpm exec tanstack-ai-persistence-sql --dialect mysql --out migrations/001_tanstack_ai.sql
```

Options:

| Option | Purpose |
| --- | --- |
| `--dialect sqlite\|postgres\|mysql` | Choose the SQL dialect. |
| `--out <path>` | Write SQL to a migration file. |
| `--stdout` | Print SQL instead of writing a file. |
| `--timestamp <yyyymmddhhmmss>` | Use a deterministic timestamp in generated names. |
| `--name <name>` | Use a deterministic migration name. |
| `--force` | Overwrite an existing output file. |

The generic CLI writes the shared persistence schema. It does not create
Cloudflare R2 artifact index tables, app-owned tables, or ORM-specific folder
layouts.

## SQLite and Postgres backend migrations

The raw SQLite and Postgres packages use the shared SQL schema.

```ts
import { ddl } from '@tanstack/ai-persistence-sql'

export const sqliteStatements = ddl('sqlite')
export const postgresStatements = ddl('postgres')
```

Use the generic CLI when you want migration files, or call `ddl(...)` from your
own migration generator.

## Cloudflare migrations

Cloudflare D1 uses the SQLite dialect for the shared SQL tables. If you also
attach R2 for artifacts and blobs, add the Cloudflare artifact index DDL.

```ts
import { cloudflareArtifactDdl } from '@tanstack/ai-persistence-cloudflare'
import { ddl } from '@tanstack/ai-persistence-sql'

export const statements = [...ddl('sqlite'), ...cloudflareArtifactDdl()]
```

Apply those statements with Wrangler, your D1 migration workflow, or your normal
deployment pipeline. Use `migrate: true` only when you intentionally want the
Worker backend to apply schema lazily.

For the shared SQL table map and the difference between plain DDL and lazy
migration bookkeeping, see [Persistence Internals](./internals).

## Prisma migrations

Use the Prisma CLI when you want the default Prisma migration folder layout.

```sh
pnpm exec tanstack-ai-persistence-prisma --dialect sqlite
pnpm exec tanstack-ai-persistence-prisma --dialect postgres --name tanstack_ai_persistence
```

The default output path is
`prisma/migrations/<timestamp>_tanstack_ai_persistence/migration.sql`.

Prisma supports SQLite and Postgres workflows. Run the generated SQL through
your Prisma migration process before using `prismaPersistence(...)` in
production. See [Prisma](./prisma) for adapter wiring.

## Drizzle migrations

Use the Drizzle CLI when you want a Drizzle-style SQL migration file.

```sh
pnpm exec tanstack-ai-persistence-drizzle --dialect sqlite
pnpm exec tanstack-ai-persistence-drizzle --dialect postgres --out drizzle/001_tanstack_ai.sql
```

The default output path is `drizzle/<timestamp>_tanstack_ai_persistence.sql`.

Drizzle supports SQLite and Postgres workflows. Run the generated SQL through
your Drizzle migration workflow before using `drizzlePersistence(...)` in
production. See [Drizzle](./drizzle) for adapter wiring.
