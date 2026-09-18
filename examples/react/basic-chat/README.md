# Basic Chat

You want a streaming chat with one OpenRouter key. Paste a key, send a message, and watch the reply stream in.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter basic-chat dev`.
3. Open http://localhost:3100.
4. Paste an OpenRouter key from https://openrouter.ai/keys.
5. Type a message and click Send.

The key stays in this tab only. A reload clears it.

The server route is `src/routes/api.chat.ts`. The chat UI is `src/routes/index.tsx`.
