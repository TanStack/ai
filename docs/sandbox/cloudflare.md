---
title: Cloudflare (Edge, Advanced)
id: cloudflare
order: 11
description: "Run a coding-agent harness and live preview at the edge with Workers, Containers, and Durable Objects."
---

If you need UI + agent loop + sandbox container in one Cloudflare Worker with a live preview URL → `@tanstack/ai-sandbox-cloudflare`.

Provider-agnostic basics → [Overview](./overview).

## Two execution models

### DO-drives-container (default)

Orchestrator DO runs `chat()` + tool-bridge; container runs the agent CLI. Full MCP crosses container → orchestrator. Demo: `examples/sandbox-cloudflare`.

### Co-located (in-container)

Harness + bridge inside container (`localProcessSandbox()`). Only host `execute()` crosses back. Enable with `createCloudflareSandboxAgent({ mode: 'colocated' })` + `runInContainerHarness` from `@tanstack/ai-sandbox-cloudflare/runner`.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  defineSandbox,
  defineWorkspace,
  httpRemoteToolExecutor,
  remoteToolStubs,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { request } from './run-request'

chat({
  threadId: request.threadId,
  adapter: grokBuildText('grok-build'),
  messages: request.messages,
  tools: remoteToolStubs(
    request.toolDescriptors,
    httpRemoteToolExecutor(request.toolExecUrl, request.toolExecToken),
  ),
  middleware: [
    withSandbox(
      defineSandbox({
        id: 'in-container',
        provider: localProcessSandbox(),
        workspace: defineWorkspace({ source: { type: 'none' } }),
      }),
    ),
  ],
})
```

Orchestrator side: `toolDescriptors(tools)` out; answer with `executeHostTool(tools, name, args)`.

## Durable runs at the edge

Cloudflare = **log-first** tier of the portable protocol ([Durable Runs](./durable-runs#the-two-tiers)) — not a parallel architecture.

Coordinator DO owns the run log (`DurableObjectRunEventLog`). Clients tail by cursor; reconnect never touches the sandbox. Journal stays for driver recovery. Adapters: `runLogStore` + `runLogStream` from `@tanstack/ai-sandbox-cloudflare/agent`.

Statuses: core `completed` / `failed` / `aborted` (`RunRecord` + `lastSeq`). Pre-1.0 layouts migrate on read.

### Three layers, three homes

| Layer | Cloudflare home |
| --- | --- |
| Run + events | Coordinator DO storage |
| Workspace files | Container FS — **not durable**; re-provision on create |
| Artifacts to keep | R2 via Blob/Artifact store |

### Edge footguns

| Symptom | Cause | Fix |
| --- | --- | --- |
| Treat journal as source of truth | `durableFilesystem: false` | DO log is durable; journal is driver recovery only |
| “Durability failed” but log has prefix | Container slept mid-run | Size `sleepAfter` above longest quiet stretch for detached runs |
| Reconnect hits wrong container | Fixed sandbox id | Prefer `id: input.threadId` for `reuse: 'thread'` |

### Disconnect vs Stop

Detach on closed tab. Stop = explicit cancel. `killableProcesses: false` → **destroy is cancel** ([takeover](./takeover#what-cancel-means-on-a-provider-that-cannot-kill)).

## Bridge vs preview hosts

Container is off-isolate — network only. Two surfaces:

| Surface | Who reaches | Host |
| --- | --- | --- |
| Bridge / tool-exec | Container → Worker | Derived from request; local → `host.docker.internal`. `PUBLIC_HOSTNAME` optional |
| Preview | Browser → Worker → container | Needs wildcard DNS: `PREVIEW_HOSTNAME`. Local `*.localhost`; deploy custom `*.domain` (`*.workers.dev` has no wildcards) |

Request-derivation is safe **on Cloudflare** (edge only dispatches owned hostnames). On plain Node, `Host` is attacker-controlled — do not copy that pattern.

## Live preview

From `@tanstack/ai-sandbox-cloudflare/agent`:

1. `exposePreviewTool(input, env)` — agent tool `exposePreview`; quick tunnel → `*.trycloudflare.com`.
2. `PREVIEW_GUIDANCE` — system prompt for tunnel-friendly dev servers.

Supply harness auth yourself as workspace secrets (package binds no key):

```ts
import {
  PREVIEW_GUIDANCE,
  createCloudflareSandboxAgent,
  exposePreviewTool,
  resolvePreviewHost,
} from '@tanstack/ai-sandbox-cloudflare/agent'
import { cloudflareSandbox } from '@tanstack/ai-sandbox-cloudflare'
import { createSecrets, defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { grokBuildText } from '@tanstack/ai-grok-build'
import type { SandboxAgentEnv } from '@tanstack/ai-sandbox-cloudflare/agent'

interface AppEnv extends SandboxAgentEnv {
  XAI_API_KEY: string
}

export const agent = createCloudflareSandboxAgent<AppEnv>({
  adapter: () => grokBuildText('grok-build'),
  systemPrompts: [PREVIEW_GUIDANCE],
  tools: (input, env) => [exposePreviewTool(input, env)],
  sandbox: (input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      provider: cloudflareSandbox({
        binding: env.Sandbox,
        previewHostname: resolvePreviewHost(env, input),
      }),
      workspace: defineWorkspace({
        source: { type: 'none' },
        secrets: createSecrets({ XAI_API_KEY: env.XAI_API_KEY }),
      }),
      lifecycle: { reuse: 'thread' },
    }),
})
```

Runnable: [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare).

### Why quick tunnel, not `exposePort`

Local Vite would serve preview assets from the **host**. Quick tunnel runs `cloudflared` **inside** the sandbox (`cloudflare/sandbox` image) — bypasses Vite, no custom domain on deploy, WebSocket/HMR works.

Dev server must accept the tunnel hostname (e.g. Vite `server: { host: true, allowedHosts: true }`).

**Transport:** `sandbox.tunnels` needs RPC. `cloudflareSandbox` defaults `transport: 'rpc'`. Custom `getSandbox()` must pass `{ transport: 'rpc' }` too. Use `'http'` only if you skip tunnel previews.
