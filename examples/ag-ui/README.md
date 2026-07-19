# AG-UI Polyglot Chat

A React SPA that talks to **Go and Rust AG-UI backends** over Server-Sent Events (SSE). Each backend streams simple chat completions from **OpenAI** or **Anthropic** — no TanStack packages on the server, just the AG-UI wire protocol.

This example shows that any backend can serve `@tanstack/ai-react` clients as long as it speaks [AG-UI](https://docs.ag-ui.com/): accept `RunAgentInput` via POST, stream AG-UI events as SSE.

## Tech stack

| Layer | Stack |
| --- | --- |
| Client | React, Vite, `@tanstack/ai-react`, `@tanstack/ai-react-ui` |
| Go server | `net/http`, hand-rolled AG-UI SSE, OpenAI/Anthropic streaming on `:8001` |
| Rust server | Axum, hand-rolled AG-UI SSE, OpenAI/Anthropic streaming on `:8002` |

## Prerequisites

- Node.js + pnpm (from repo root)
- [Go 1.22+](https://go.dev/dl/)
- [Rust stable](https://rustup.rs/)
- OpenAI and/or Anthropic API keys

## Quick start

From the monorepo root:

```bash
pnpm install
cd examples/ag-ui
cp .env.example .env
# Add OPENAI_API_KEY and/or ANTHROPIC_API_KEY
pnpm dev:all
```

Open [http://localhost:3000](http://localhost:3000), pick **Go** or **Rust**, choose a provider/model, and chat.

### Run pieces separately

```bash
# Terminal 1 — Vite dev server (proxies /api/go and /api/rust)
pnpm dev

# Terminal 2 — Go server (loads keys from your shell env)
pnpm dev:go

# Terminal 3 — Rust server
pnpm dev:rust
```

`pnpm dev:all` loads `.env` automatically via `scripts/dev-all.mjs`.

## Architecture

```
React SPA (useChat + fetchServerSentEvents)
  POST /api/go   ──► Vite proxy ──► Go   :8001 ──► OpenAI / Anthropic
  POST /api/rust ──► Vite proxy ──► Rust :8002 ──► OpenAI / Anthropic
```

The client sends AG-UI `RunAgentInput` with `forwardedProps: { provider, model }`. Each server converts simple text messages, streams the provider response, and emits:

```
RUN_STARTED
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT (streamed)
TEXT_MESSAGE_END
RUN_FINISHED
data: [DONE]
```

## Project layout

```
examples/ag-ui/
├── src/              React SPA
├── servers/go/       Go AG-UI + LLM server
└── servers/rust/     Rust AG-UI + LLM server
```

## Related docs

- [AG-UI compliance migration](../../docs/migration/ag-ui-compliance.md)
- [Connection adapters](../../docs/chat/connection-adapters.md)
- [Chat architecture](../../packages/ai/docs/chat-architecture.md)
