---
title: Tools
id: tools
order: 6
description: "Give the in-sandbox agent your app's own server tools. They run on your host, with their database, secrets, and closures, over an authenticated MCP tool proxy."
---

The agent in the sandbox can edit files and run commands. It cannot reach your app: your database, your secrets, or the closures in your tool code.

Pass your server tools to `chat()`. TanStack AI bridges them into the sandbox. The agent calls them like any MCP tool, and each tool runs on your host.

## Bridge a tool into the sandbox

1. Define a server tool, the same as for any `chat()` call.
2. Pass it in `tools`, next to `withSandbox`.

```ts
import { chat, toolDefinition } from '@tanstack/ai'
import { GROK_CLI_INSTALL_COMMAND, grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { z } from 'zod'

// Lives on your host. The sandbox never sees it.
const todos = [{ id: '1', userId: 'u1', title: 'Fix the login bug' }]

const getTodos = toolDefinition({
  name: 'getTodos',
  description: 'List the todos of a user.',
  inputSchema: z.object({ userId: z.string() }),
}).server(async ({ userId }) => todos.filter((t) => t.userId === userId))

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
  }),
})

const stream = chat({
  threadId: 'thread-1',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Fix the bugs in the todos of user u1.' }],
  tools: [getTodos],
  middleware: [withSandbox(repoSandbox)],
})
```

The agent can now call `getTodos`. The tool reads `todos` on your host and sends the result into the sandbox.

## How it works

The agent always has its own native tools (Bash, file edits, search). They run on the sandbox filesystem. Your `chat()` tools go over a host-side MCP tool proxy:

1. The agent calls the tool by name, like any MCP tool.
2. The call crosses the sandbox boundary to your host.
3. The tool's `execute()` runs on your host, with its database handle, secrets, and closures.
4. The result goes back into the sandbox as the tool output.

`execute()` never goes into the sandbox. Only the call and the result cross the boundary.

A random bearer token for each run protects the bridge. Only the agent of this run has that token, so only it can call your tools.

> [!NOTE]
> This page is about your own tools, bridged back to your server. To give the agent third-party MCP servers that it calls directly, declare them on the workspace. See [Provisioning](./provisioning). For server tools in general, see [Server Tools](../tools/server-tools).

## Make sure the sandbox can reach the bridge

The bridge is an HTTP endpoint that the sandbox calls back to. So the sandbox must be able to connect to your server.

| Where it runs | Host the sandbox calls | Setup |
| --- | --- | --- |
| Local process | `localhost` | None. |
| Docker container (`dockerSandbox`) | `host.docker.internal` | None. |
| Docker Sandboxes (`sbxSandbox`) | `host.docker.internal` | A deny or ask allowlist must include `localhost`. `sbxSandbox()` adds it when it writes a real allowlist. |
| Deployed server (production) | Your public host, from the request | None. |
| Cloud sandbox, driven from your laptop | Your laptop, which has no public URL | Tunnel the bridge with `withNgrokBridge`. |

### Local process and Docker container

The sandbox runs on the same machine as your server. It reaches it on `localhost` (local process) or `host.docker.internal` (Docker container). Bridged tools need no extra setup. If the HTTP listener cannot start, bridge startup rejects with the original Node.js error.

### Docker Sandboxes (`sbxSandbox`)

The guest still calls `host.docker.internal`. The host HTTP proxy changes that host to `localhost` before it checks `sbx policy`. If you write a deny or ask allowlist, allow `localhost` (or let `sbxSandbox()` add it). `denyNetwork` alone does not write that allowlist.

### A deployed server (production)

A deployed server already has a public URL, so the sandbox can reach the bridge. The provisioner sends your public host (taken from the incoming request) and not `localhost`. Every call still needs the bearer token for the run, so a public endpoint is safe. The edge setup uses the same path. See [Cloudflare](./cloudflare).

### A cloud sandbox, driven from your laptop

A cloud provider (Daytona, Vercel, Sprites, and the others) runs a remote VM. In local dev, that VM cannot call your `localhost`, and your laptop has no public URL.

The `@tanstack/ai-sandbox/ngrok` subpath tunnels the bridge through [ngrok](https://ngrok.com):

1. Install the optional peer dependency `@ngrok/ngrok`:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @ngrok/ngrok
vue: @ngrok/ngrok
solid: @ngrok/ngrok
svelte: @ngrok/ngrok
preact: @ngrok/ngrok
angular: @ngrok/ngrok
vanilla: @ngrok/ngrok
octane: @ngrok/ngrok

<!-- ::end:tabs -->

2. Set `NGROK_AUTHTOKEN`.
3. Add `withNgrokBridge` **after** `withSandbox(...)`:

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { withNgrokBridge } from '@tanstack/ai-sandbox/ngrok'
import { repoSandbox } from './sandbox'
import { getTodos } from './tools'

chat({
  threadId: 'thread-1',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Fix the bugs in the todos of user u1.' }],
  tools: [getTodos],
  // Cloud provider in local dev: tunnel the bridge so the remote sandbox can
  // reach it. Local process and Docker do not need this.
  middleware: [withSandbox(repoSandbox), withNgrokBridge],
})
```

`withNgrokBridge` is for local dev only. In production your deployed server is already reachable, so you ship without it.
