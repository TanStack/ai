# AG-UI Polyglot Chat

A React SPA that talks to **Go, Rust, PHP, Zig, Bash, and Python AG-UI backends** over Server-Sent Events (SSE). Each backend streams simple chat completions from **OpenAI** or **Anthropic** — no TanStack packages on the server, just the AG-UI wire protocol.

This example shows that any backend can serve `@tanstack/ai-react` clients as long as it speaks [AG-UI](https://docs.ag-ui.com/): accept `RunAgentInput` via POST, stream AG-UI events as SSE.

## Tech stack

| Layer         | Stack                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Client        | React, Vite, `@tanstack/ai-react`, `@tanstack/ai-react-ui`               |
| Go server     | `net/http`, hand-rolled AG-UI SSE, OpenAI/Anthropic streaming on `:8001` |
| Rust server   | Axum, hand-rolled AG-UI SSE, OpenAI/Anthropic streaming on `:8002`       |
| PHP server    | Built-in PHP server + curl, hand-rolled AG-UI SSE on `:8003`             |
| Zig server    | Stdlib HTTP + HTTPS client, hand-rolled AG-UI SSE on `:8004`             |
| Bash server   | Bash + socat + curl + jq, hand-rolled AG-UI SSE on `:8005`               |
| Python server | Stdlib HTTP + urllib, hand-rolled AG-UI SSE on `:8006`                   |

## Prerequisites

- Node.js + pnpm (from repo root)
- [Go 1.22+](https://go.dev/dl/) (optional — UI shows setup if missing)
- [Rust stable](https://rustup.rs/) (optional)
- [PHP 8.2+ CLI with curl](https://www.php.net/downloads) (optional)
- [Zig](https://ziglang.org/download/) (optional)
- Bash 4+, curl, jq, and socat (`brew install bash jq socat`) (optional)
- [Python 3.9+](https://www.python.org/downloads/) (optional)
- OpenAI and/or Anthropic API keys

Only backends whose toolchains are detected on PATH are started by `pnpm dev:all`. The UI reads `public/servers.json` to show which servers are available and displays setup instructions for missing ones.

## Quick start

From the monorepo root:

```bash
pnpm install
cd examples/ag-ui
cp .env.example .env
# Add OPENAI_API_KEY and/or ANTHROPIC_API_KEY
pnpm dev:all
```

Open [http://localhost:3000](http://localhost:3000), pick a backend tab, choose a provider/model, and chat.

### Simulate missing toolchains

If your machine has every runtime installed but you want to test the setup UI:

```bash
AGUI_DISABLE_SERVERS=php,zig pnpm dev:all
```

PHP and Zig tabs will show install instructions; Go and Rust still connect normally.

### Run pieces separately

```bash
# Terminal 1 — Vite dev server (proxies /api/* and serves servers.json)
pnpm dev

# Terminal 2+ — individual backends
pnpm dev:go
pnpm dev:rust
pnpm dev:php
pnpm dev:zig
pnpm dev:bash
pnpm dev:python
```

`pnpm dev:all` loads `.env`, writes `public/servers.json`, and starts the client plus every detected backend.

Refresh availability without restarting everything:

```bash
pnpm detect-servers
```

## Architecture

```
React SPA (useChat + fetchServerSentEvents)
  GET  /servers.json          ──► generated backend availability
  POST /api/go   ──► Vite proxy ──► Go   :8001 ──► OpenAI / Anthropic
  POST /api/rust ──► Vite proxy ──► Rust :8002 ──► OpenAI / Anthropic
  POST /api/php  ──► Vite proxy ──► PHP  :8003 ──► OpenAI / Anthropic
  POST /api/zig  ──► Vite proxy ──► Zig  :8004 ──► OpenAI / Anthropic
  POST /api/bash ──► Vite proxy ──► Bash :8005 ──► OpenAI / Anthropic
  POST /api/python ──► Vite proxy ──► Python :8006 ──► OpenAI / Anthropic
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
├── public/servers.json   generated backend availability (fallback committed)
├── scripts/              detect toolchains, write servers.json, dev:all
├── src/                  React SPA
├── servers/go/           Go AG-UI + LLM server
├── servers/rust/         Rust AG-UI + LLM server
├── servers/php/          PHP AG-UI + LLM server
├── servers/zig/          Zig AG-UI + LLM server
├── servers/bash/         Bash AG-UI + LLM server
└── servers/python/       Python AG-UI + LLM server
```

## Related docs

- [AG-UI compliance migration](../../docs/migration/ag-ui-compliance.md)
- [Connection adapters](../../docs/chat/connection-adapters.md)
- [Chat architecture](../../packages/ai/docs/chat-architecture.md)
