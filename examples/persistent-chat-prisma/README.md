# Persistent Chat — Prisma 7 (SQLite)

The [`ts-react-chat` persistent-chat demo](../ts-react-chat/src/routes/persistent-chat.tsx),
backed by `@tanstack/ai-persistence-prisma` on **Prisma 7** over SQLite with
native Prisma migrations.

Server-authoritative persistence: the client caches only a resume pointer
(`messages: false`); on mount `useChat` hydrates the thread from the server by
its id. Start a long reply, roll dice, or send an email (which pauses for
approval), then reload or open the URL elsewhere — it resumes from SQLite.

## How the schema and migrations work

- `prisma/schema/tanstack-ai.prisma` is the models fragment copied from the
  package (`pnpm exec tanstack-ai-prisma-models --out prisma/schema`); it lives
  alongside the app's `schema.prisma` (datasource + `prisma-client` generator).
- Prisma 7 config is `prisma.config.ts`. The generator emits an ESM client to
  `src/generated/prisma` (gitignored); import it from there, not `@prisma/client`.
- `prisma migrate dev` creates the migrations in `prisma/migrations` (committed);
  `prisma migrate deploy` applies them (run by `predev`).
- Prisma 7 uses a driver adapter for SQLite: the runtime wires a
  `PrismaBetterSQLite3` adapter into `new PrismaClient({ adapter })`.

## Run it

```bash
# From the repo root, once: build the workspace packages this app imports.
pnpm build

cd examples/persistent-chat-prisma
cat > .env <<'EOF'
OPENAI_API_KEY=sk-...
DATABASE_URL=file:./.data/persistent-chat.db
EOF

pnpm db:generate                       # generate the v7 client into src/generated
pnpm exec prisma migrate deploy        # apply committed migrations (or `migrate dev` to add new ones)
pnpm dev                               # serves on :3021
```

Open http://localhost:3021.
