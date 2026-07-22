---
name: tanstack-ai-memory-hindsight
description: Use when wiring hindsight() from @tanstack/ai-memory/hindsight — a hosted memory adapter that buckets memory per conversation and exposes retain/recall/reflect tools to the model. Requires the optional @vectorize-io/hindsight-client peer.
---

# Hindsight Memory Adapter

Hosted `recall`/`save` adapter backed by Hindsight. Hindsight owns extraction and
ranking server-side, buckets memory into per-conversation "banks"
(`{userId}__{sessionId}`), and — uniquely — exposes LLM **tools** through `recall` so the
model can retain/recall/reflect directly.

## Setup

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { hindsight } from '@tanstack/ai-memory/hindsight'

const memory = hindsight({ user: currentUserId }) // baseUrl defaults to HINDSIGHT_URL

memoryMiddleware({ adapter: memory, scope })
```

`@vectorize-io/hindsight-client` is an **optional peer dependency**, loaded lazily on
first use — install it where you use `hindsight()`.

## Options

- `user` — durable user id for the bank key (falls back to `scope.userId`).
- `baseUrl` — Hindsight server URL (default `HINDSIGHT_URL` or `http://localhost:8888`).
- `budget` — recall budget: `'low' | 'mid' | 'high'` (default `'mid'`).
- `onToolRetain` / `onToolRecall` — callbacks fired when the model uses the memory tools.

## Tools

`recall` returns `hindsight_retain`, `hindsight_recall`, and `hindsight_reflect` in its
`tools` plus a `toolGuidance` block. `memoryMiddleware` merges them into the run so the
model can manage long-term memory itself.
