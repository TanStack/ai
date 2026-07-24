# Persistent Chat — Drizzle (SQLite)

The [`ts-react-chat` persistent-chat demo](../ts-react-chat/src/routes/persistent-chat.tsx),
backed by `@tanstack/ai-persistence-drizzle` over SQLite with **real migrations**
instead of the runtime table bootstrap.

Server-authoritative persistence: the client caches only a resume pointer
(`messages: false`); on mount `useChat` hydrates the thread from the server by
its id. Start a long reply, roll dice, or send an email (which pauses for
approval), then reload or open the URL elsewhere — it resumes from SQLite.

## How the schema and migrations work

- `src/db/tanstack-ai-schema.ts` re-exports the package's stock SQLite tables so
  drizzle-kit owns the DDL in this repo.
- `drizzle.config.ts` points drizzle-kit at that module.
- `pnpm db:generate` emits versioned SQL into `./drizzle` (committed).
- `scripts/migrate.mjs` applies those SQL files directly with Node's built-in
  `node:sqlite` driver, tracking applied files in a `__migrations` table — no
  drizzle-kit runtime driver required. `predev` runs it automatically.
- The runtime uses `sqlitePersistence({ schema, ensureTables: false })`, so the
  migrations (not a runtime bootstrap) create the tables.

## Run it

```bash
# From the repo root, once: build the workspace packages this app imports.
pnpm build

cd examples/persistent-chat-drizzle
echo "OPENAI_API_KEY=sk-..." > .env   # any OpenAI key; the demo uses gpt-5.5

pnpm db:generate   # emit ./drizzle SQL (already committed; safe to re-run)
pnpm dev           # predev applies migrations, then serves on :3020
```

Open http://localhost:3020.
