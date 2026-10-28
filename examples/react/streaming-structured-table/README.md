# Streaming Structured Table

You want a table that fills while `chat({ outputSchema, stream: true })` writes JSON. Paste a key, send a prompt, and watch rows appear.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter streaming-structured-table dev`.
3. Open http://localhost:3100.
4. Paste an OpenRouter key from https://openrouter.ai/keys.
5. Send a prompt such as `Compare 6 JavaScript frameworks`.

The key stays in this tab only. A reload clears it.

The schema is `src/lib/table-schema.ts`. The server route is `src/routes/api.chat.ts`. The table UI is `src/routes/index.tsx`.
