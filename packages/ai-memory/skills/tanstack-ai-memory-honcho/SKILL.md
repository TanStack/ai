---
name: tanstack-ai-memory-honcho
description: Use when wiring honcho() from @tanstack/ai-memory/honcho — a hosted memory adapter where recall is a dialectic answer over the user's representation (no discrete fragments). Requires the optional @honcho-ai/sdk peer.
---

# Honcho Memory Adapter

Hosted `recall`/`save` adapter backed by Honcho. Honcho models memory as peers
exchanging messages in a session; `recall` returns a **synthesized dialectic answer**
over the user peer's representation (so there are no discrete fragments), and `save`
appends the turn's messages to the session.

## Setup

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { honcho } from '@tanstack/ai-memory/honcho'

const memory = honcho({ user: currentUserId }) // baseURL defaults to HONCHO_URL

memoryMiddleware({ adapter: memory, scope })
```

`@honcho-ai/sdk` is an **optional peer dependency**, loaded lazily on first use — install
it where you use `honcho()`.

## Options

- `user` — user peer id (falls back to `scope.userId`, then `'demo-user'`).
- `baseURL` — Honcho server URL (default `HONCHO_URL` or `http://localhost:8001`).
- `workspaceId` — default `HONCHO_APP_NAME` or `'ai-memory'`.
- `apiKey` — default `HONCHO_API_KEY`.
- `assistantId` — assistant peer id (default `'assistant'`).

`recall` calls the user peer's dialectic `chat()` and injects the answer as the system
prompt; Honcho exposes no LLM tools.
