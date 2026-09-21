# Subagents

You want a blog-writing chat. Some turns need research. Some turns need a draft. Jev picks the agent. The UI shows a nested card.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter subagents dev`.
3. Open http://localhost:3100.
4. Paste an OpenRouter key from https://openrouter.ai/keys.
5. Send a research prompt or a draft prompt.

The OpenRouter key stays in this tab only. A reload clears it. Chat and Jev both use that key.

The server route is `src/routes/api.chat.ts`. The agents live in `src/lib/agents.ts`. The UI factory is `src/chat-ui.tsx`.
