---
title: Tools
id: tools
order: 6
description: "Bridge host tools (DB, secrets, closures) into the in-sandbox agent over an authenticated MCP proxy."
---

If you need the agent to call **your app** (DB, secrets, closures) → pass `tools` to `chat()` with a sandbox. `execute()` stays on the host.

| Kind | Where it runs | Configure |
| --- | --- | --- |
| Native (Bash, edit, search) | Inside sandbox | Automatic |
| Bridged server tools | Host `execute()` | `chat({ tools })` |
| Third-party MCP | Direct from agent | [Provisioning](./provisioning) |

General server tools → [server tools](../tools/server-tools).

## How the bridge works

1. Agent calls the tool by name (MCP).
2. Call proxies across the sandbox boundary.
3. `execute()` runs **on the host** (DB, secrets, closures intact).
4. Result returns as tool-call output.

Gated by a **random per-run bearer token**.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'
import { messages, threadId } from './chat-context'
import { getTodos } from './tools'
import { db } from './db'

chat({
  threadId,
  adapter: grokBuildText('grok-build'),
  messages,
  tools: [
    getTodos.server(async ({ userId }: { userId: string }) =>
      db.todos.find({ userId }),
    ),
  ],
  middleware: [withSandbox(repoSandbox)],
})
```

## Reach the bridge

The sandbox must dial the orchestrator:

| Topology | Host sandbox dials | Setup |
| --- | --- | --- |
| Local process / Docker | `localhost` / `host.docker.internal` | None |
| Deployed orchestrator | Public host from request | None |
| Cloud sandbox + laptop | Laptop (no public URL) | `withNgrokBridge` |

### Cloud sandbox from your laptop

1. Set `NGROK_AUTHTOKEN`.
2. `npm i @ngrok/ngrok` (optional peer of `@tanstack/ai-sandbox/ngrok`).
3. Add `withNgrokBridge` **after** `withSandbox`:

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { withNgrokBridge } from '@tanstack/ai-sandbox/ngrok'
import { repoSandbox } from './sandbox'
import { messages, threadId } from './chat-context'
import { getTodos } from './tools'
import { db } from './db'

chat({
  threadId,
  adapter: grokBuildText('grok-build'),
  messages,
  tools: [
    getTodos.server(async ({ userId }: { userId: string }) =>
      db.todos.find({ userId }),
    ),
  ],
  middleware: [withSandbox(repoSandbox), withNgrokBridge],
})
```

Local-dev only. Production orchestrators are already reachable — ship without it. Edge co-location → [Cloudflare](./cloudflare).
