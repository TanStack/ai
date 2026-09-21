# Subagents

You want a blog-writing chat. Some turns need research. Some turns need a draft. Jev picks the agent. The UI shows a nested card.

## Run it

1. From the repo root, run `pnpm install`.
2. Set `TYPESAFE_API_KEY` in `examples/react/subagents/.env.local`.
3. Run `pnpm --filter subagents dev`.
4. Open http://localhost:3100.
5. Paste an OpenRouter key from https://openrouter.ai/keys.
6. Send a research prompt or a draft prompt.

The OpenRouter key stays in this tab only. A reload clears it. Jev runs on the server with `TYPESAFE_API_KEY`.

The server route is `src/routes/api.chat.ts`. The agents live in `src/lib/agents.ts`. The UI is `src/routes/index.tsx`.
