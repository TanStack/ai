---
title: Tools
id: tools
order: 6
description: "Bridge your app's host tools — with their DB, secrets, and closures — into the in-sandbox agent over an authenticated MCP tool-proxy."
---

The agent inside the sandbox always has its own **native tools**: Bash, file
edits, and search, running directly on the sandbox filesystem. That covers
everything the agent does locally to the working tree.

What it can't do on its own is reach back into _your_ app — your database, your
secrets, the closures you captured when you defined a tool. For that, the
`chat()`-provided **server tools** are **bridged** into the sandbox.

> This page is about your own host tools, bridged back to the orchestrator. If
> instead you want to give the agent third-party MCP servers it talks to
> directly (no host round-trip), those are declared on the workspace — see
> [Provisioning](./provisioning). For server tools in general, see the main
> [server tools](../tools/server-tools) doc.

## Native vs bridged tools

When you pass `tools` to `chat()` with a sandbox in the middleware, each tool is
exposed to the in-sandbox agent over a **host-side MCP tool-proxy**:

1. The agent calls the tool by name, as it would any MCP tool.
2. The call is proxied back across the sandbox boundary to the host.
3. The tool's `execute()` runs **on the host** — keeping its DB handle, secrets,
   and any closures it captured.
4. The result is returned into the sandbox as the tool-call output.

So `execute()` never ships into the sandbox; only the call and its result cross
the boundary. The tool keeps running where it was defined.

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
  // `execute()` closes over `db` and runs on the host — never in the sandbox.
  tools: [
    getTodos.server(async ({ userId }: { userId: string }) =>
      db.todos.find({ userId }),
    ),
  ],
  middleware: [withSandbox(repoSandbox)],
})
```

The bridge is gated by a **random per-run bearer token**, so the proxy endpoint
is not an open door — only the agent for this run, holding that token, can
invoke your tools.

## Reaching the bridge

The bridge is an HTTP endpoint the **sandbox calls back to**. For bridged tools
to work, the sandbox has to be able to open a connection to your orchestrator.
That holds in two cases and breaks in a third.

| Topology | Host the sandbox dials | Setup |
| --- | --- | --- |
| Local process / Docker | `localhost` / `host.docker.internal` | None — works out of the box. |
| Deployed orchestrator (production) | Your public host, derived from the request | None — works out of the box. |
| Remote cloud sandbox, driven from your laptop | Your laptop, which has no public URL | Tunnel the bridge with `withNgrokBridge`. |

### Local process / Docker

The orchestrator is the same machine as the sandbox, reached on `localhost`
(local-process) or `host.docker.internal` (Docker). Bridged tools work with no
extra configuration.

### A deployed orchestrator (production)

A deployed orchestrator already has a public URL, so the bridge is reachable out
of the box. The provisioner advertises your public host — derived from the
incoming request — instead of `localhost`, and every call is still gated by the
per-run bearer token, so exposing the endpoint publicly is safe. This is the
same path the edge/Cloudflare deployment uses; see [Cloudflare](./cloudflare).

### A remote cloud sandbox, driven from your laptop

With a cloud provider (Daytona, Vercel, Sprites) in **local dev**, the sandbox is a remote
VM. It **cannot dial your machine's `localhost`**, and your laptop has no public
URL, so bridged tools can't reach the host until you expose the bridge.

The `@tanstack/ai-sandbox/ngrok` subpath tunnels the loopback bridge through
[ngrok](https://ngrok.com) so a remote sandbox can reach it. Set
`NGROK_AUTHTOKEN`, then add `withNgrokBridge` **after** `withSandbox(...)`:

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
  // Cloud provider in local dev → tunnel the host bridge so the remote sandbox
  // can reach it. Local process / Docker don't need this.
  middleware: [withSandbox(repoSandbox), withNgrokBridge],
})
```

`@ngrok/ngrok` is an **optional peer dependency** — install it alongside the
subpath (`npm i @ngrok/ngrok`). `withNgrokBridge` is purely a local-dev
convenience: in production your deployed orchestrator is already reachable, so
you ship without it.
