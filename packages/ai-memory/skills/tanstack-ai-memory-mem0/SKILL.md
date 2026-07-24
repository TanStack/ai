---
name: tanstack-ai-memory-mem0
description: Use when wiring mem0() from @tanstack/ai-memory/mem0 — a hosted memory adapter that talks to a mem0 server over plain HTTP (no SDK peer). Requires a running mem0 server.
---

# mem0 Memory Adapter

Hosted `recall`/`save` adapter backed by a mem0 server. mem0 owns extraction and ranking
server-side. Talks to the server over plain HTTP — **no SDK peer dependency**.

## Setup

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { mem0 } from '@tanstack/ai-memory/mem0'

const memory = mem0({ user: currentUserId }) // baseUrl defaults to MEM0_URL

memoryMiddleware({ adapter: memory, scope })
```

Requires a running mem0 server (self-hosted or hosted). Point it via `baseUrl` (or
`MEM0_URL`); pass `apiKey` (or `MEM0_ADMIN_API_KEY`) when secured.

## Options

- `user` — mem0 `user_id` (falls back to `scope.userId`, then `'demo-user'`).
- `baseUrl` — mem0 server URL (default `MEM0_URL` or `http://localhost:8000`).
- `apiKey` — bearer token (default `MEM0_ADMIN_API_KEY`).
- `rerank` (default `true`), `threshold` (default `0.1`) — search tuning.

`save` posts the `{ user, assistant }` turn to `/memories`; `recall` queries `/search`
and renders the results into the system prompt. mem0 exposes no LLM tools.
