---
title: Cloudflare Edge Details
id: cloudflare-advanced
description: "The co-located model, live previews through a quick tunnel, callback hosts, the Durable Object run log, and what edge durability does not cover, for @tanstack/ai-sandbox-cloudflare."
keywords:
  - colocated
  - runInContainerHarness
  - exposePreviewTool
  - PREVIEW_GUIDANCE
  - resolvePreviewHost
  - resolveBridgeOrigin
  - runLogStore
  - runLogStream
---

Use this page after the [Cloudflare setup](./cloudflare) works, when you add previews, move the agent loop into the container, or plan for production.

## Co-located mode

In the default **DO-drives** model, the coordinator Durable Object runs `chat()` and the tool bridge, and the container runs only the agent CLI. The agent reaches the bridge across the container-to-Worker boundary, so the whole MCP protocol crosses that boundary.

In the **co-located** model, the agent loop **and** the tool bridge run inside the container. The in-container sandbox is `localProcessSandbox()`, with native stdin and a localhost `node:http` bridge. Only host **tool execution** crosses back: a `chat()` tool's `execute()` (your database, secrets, app state) lives on the coordinator. The public surface shrinks from the whole MCP protocol to one authenticated tool-exec call.

To turn it on:

1. Pass these fields to `createCloudflareSandboxAgent`:

| Field | What it is |
| --- | --- |
| `mode` | `'colocated'` |
| `harness` | The CLI the runner starts: `'claude-code'`, `'codex'`, or `'opencode'`. |
| `model` | The model id passed to that harness. |
| `workspace` | The workspace the runner bootstraps in the container. |

2. Start the runner as the container's program. You supply only the adapter for a `{ harness, model }`:

```ts
// container/runner.ts: runs inside the container, on Node.
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { runInContainerHarness } from '@tanstack/ai-sandbox-cloudflare/runner'

// Listens on `port`, else the RUNNER_PORT env var, else 8080.
runInContainerHarness({
  resolveAdapter: ({ model }) => claudeCodeText(model),
})
```

The coordinator sends `POST /run` to the runner with the messages and the serialized tools. The runner streams `StreamChunk`s back as NDJSON.

### The tool seam

Four exports from `@tanstack/ai-sandbox` carry the tools across:

1. The coordinator serializes its tools with `toolDescriptors(tools)` and sends the descriptors in.
2. The container rebuilds them with `remoteToolStubs(descriptors, executor)`.
3. Each stub's `execute()` calls a `RemoteToolExecutor`. `httpRemoteToolExecutor(url, token)` posts `{ name, args }` back.
4. The coordinator answers that call with `executeHostTool(tools, name, args, { threadId })`. The tool gets the `threadId` of the run in its context.

To write your own runner, this is what `runInContainerHarness` does inside the container:

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
// The body the coordinator posted: { threadId, messages, toolDescriptors,
// toolExecUrl, toolExecToken }.
import { request } from './run-request'

chat({
  threadId: request.threadId,
  adapter: grokBuildText('grok-build'),
  messages: request.messages,
  // Stubs whose execute() posts back to the coordinator. Only this one call
  // leaves the container.
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

## Show a live preview

Users want to see the app the agent builds. The package ships two pieces for that, both from `@tanstack/ai-sandbox-cloudflare/agent`:

- **`exposePreviewTool(input, env)`**: a `chat()` server tool, named `exposePreview` for the agent. It opens a **Cloudflare quick tunnel** to a dev server port in the run's container (`sandbox.tunnels.get(port)`) and returns a `https://<name>.trycloudflare.com` URL.
- **`PREVIEW_GUIDANCE`**: a system prompt that tells the agent how to start a dev server that works through the tunnel. It is not tied to any app.

`exposePreviewTool` finds the container by `threadId`: `getSandbox(env.Sandbox, input.threadId)`. The stock `cloudflareSandbox` names its container with the sandbox key that `defineSandbox` computes, not with the `threadId`. So pin the container name with a small provider, as `examples/sandbox-cloudflare` does.

1. Install `@cloudflare/sandbox` in your app, to import `getSandbox`.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @cloudflare/sandbox
vue: @cloudflare/sandbox
solid: @cloudflare/sandbox
svelte: @cloudflare/sandbox
preact: @cloudflare/sandbox
angular: @cloudflare/sandbox
octane: @cloudflare/sandbox
vanilla: @cloudflare/sandbox

<!-- ::end:tabs -->

2. Add a provider that names the container.

```ts ignore
// src/sandbox-provider.ts
import { getSandbox } from '@cloudflare/sandbox'
import {
  CLOUDFLARE_CAPS,
  CloudflareHandle,
} from '@tanstack/ai-sandbox-cloudflare'
import type { Sandbox } from '@cloudflare/sandbox'
import type {
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

const WORKDIR = '/workspace'

// Tunnels need the RPC transport, and every getSandbox() for one id must use
// the same transport.
const SANDBOX_OPTIONS = { transport: 'rpc' } as const

export function namedCloudflareSandbox(
  binding: DurableObjectNamespace<Sandbox>,
  name: string,
): SandboxProvider {
  return {
    name: 'cloudflare-named',
    capabilities: () => CLOUDFLARE_CAPS,
    async create(input: SandboxCreateInput): Promise<SandboxHandle> {
      const sandbox = getSandbox(binding, name, SANDBOX_OPTIONS)
      if (input.env && Object.keys(input.env).length > 0) {
        await sandbox.setEnvVars(input.env)
      }
      await sandbox.mkdir(WORKDIR, { recursive: true })
      return new CloudflareHandle(name, sandbox, WORKDIR)
    },
    resume: (input: SandboxResumeInput): Promise<SandboxHandle> =>
      Promise.resolve(
        new CloudflareHandle(
          input.id,
          getSandbox(binding, input.id, SANDBOX_OPTIONS),
          WORKDIR,
        ),
      ),
    async destroy(input: SandboxDestroyInput): Promise<void> {
      await getSandbox(binding, input.id, SANDBOX_OPTIONS).destroy()
    },
  }
}
```

3. In `src/agent.ts`, use that provider with the `threadId`, and add the tool and the guidance.

```ts
// src/agent.ts
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import {
  PREVIEW_GUIDANCE,
  createCloudflareSandboxAgent,
  exposePreviewTool,
} from '@tanstack/ai-sandbox-cloudflare/agent'
import { namedCloudflareSandbox } from './sandbox-provider'
import type { SandboxAgentEnv } from '@tanstack/ai-sandbox-cloudflare/agent'

export interface AppEnv extends SandboxAgentEnv {
  ANTHROPIC_API_KEY: string
}

export const agent = createCloudflareSandboxAgent<AppEnv>({
  adapter: () => claudeCodeText('claude-opus-4-8'),
  systemPrompts: [PREVIEW_GUIDANCE],
  tools: (input, env) => [exposePreviewTool(input, env)],
  sandbox: (input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      // The same container that exposePreview addresses.
      provider: namedCloudflareSandbox(env.Sandbox, input.threadId),
      workspace: defineWorkspace({
        source: { type: 'none' },
        secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }),
      }),
      lifecycle: { reuse: 'thread' },
    }),
})
```

Ask the agent to build and serve a small app. It starts the dev server, calls `exposePreview`, and replies with a `trycloudflare.com` URL.

A container named by `threadId` also helps `reuse: 'thread'`: reconnects and previews reach the same container, even after the coordinator Durable Object is evicted.

The dev server must accept the tunnel hostname, because servers reject unknown hosts. `PREVIEW_GUIDANCE` tells the agent this:

- Vite: `server: { host: true, allowedHosts: true }`.
- webpack-dev-server: `allowedHosts: 'all'`.

For a complete app that runs Claude Code, Codex, or Grok Build (picked in the UI or with the `HARNESS` var), see [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare).

### Why a quick tunnel, not `exposePort`

`exposePort` plus `proxyToSandbox` routes the preview through the Worker's own origin. In local dev, that origin is your Vite dev server. Vite's middleware then serves the preview's module and asset requests (`/@vite/client`, `/src/*`, `/@fs/*`) from your **host**, not the container. The page loads the wrong code and breaks.

A quick tunnel runs `cloudflared` **inside** the sandbox (the `cloudflare/sandbox` base image ships it). So:

- It skips the Vite port entirely.
- It needs no custom domain on a deploy.
- It forwards WebSockets, so the app's HMR works.

`exposePort` with `resolvePreviewHost` stays available for apps that want the Worker in front of the preview, on a custom domain.

### The transport must be `rpc`

`sandbox.tunnels` exists only on the SDK's **RPC** transport. On the default `http` transport it throws "requires the RPC transport". So:

- `cloudflareSandbox` defaults to `transport: 'rpc'`.
- Set the `SANDBOX_TRANSPORT` var to `rpc` for the Sandbox Durable Object.
- A custom provider must pass `{ transport: 'rpc' }` on **every** `getSandbox()` for an id. A different transport for the same id disconnects the run's active client.

Set `transport: 'http'` only if you use no tunnel previews.

## Callback hosts: bridge vs preview

The container is off-isolate compute. It cannot use a service binding or an in-process call to reach the Worker, only the network. So its callback URLs need real hosts. There are two surfaces, each with its own resolver in `@tanstack/ai-sandbox-cloudflare/agent`:

| Surface | Who calls it | Resolver | Config |
| --- | --- | --- | --- |
| Bridge and tool-exec (`/_bridge`, `/tool-exec`) | The container calls the Worker. | `resolveBridgeOrigin` | `PUBLIC_HOSTNAME`, optional. |
| Preview (`exposePort`) | The browser calls the Worker, which calls the container. | `resolvePreviewHost` | `PREVIEW_HOSTNAME`, needs wildcard DNS. |

**Bridge.** It only has to reach the Worker. When `PUBLIC_HOSTNAME` is unset, the host comes from the `POST /runs` request:

- A `*.workers.dev` deploy works with no config.
- Local dev uses `host.docker.internal` (the Docker host gateway, over `http`). No tunnel.

Taking the host from the request is safe **on Cloudflare**. The edge sends a request to your Worker only when its hostname matches a route you own, so the `Host` is always one of yours. The per-run bearer token in the URL cannot be sent to another domain. On a plain Node server, the `Host` header is attacker-controlled, so the same trick leaks the token (an SSRF risk). See [Tools](./tools) for the non-edge bridge.

**Preview** (the `exposePort` path only). It needs wildcard DNS, so `PREVIEW_HOSTNAME` is a separate setting:

- **Local** uses `*.localhost`. Browsers resolve it to loopback, so previews work locally with no tunnel.
- **Deployed** needs a custom domain with a `*.<domain>` route. `*.workers.dev` has no wildcard subdomains, so the SDK's `exposePort` rejects it, and `resolvePreviewHost` throws a clear error that names `PREVIEW_HOSTNAME`.

```jsonc
{
  "routes": [{ "pattern": "*.preview.example.com/*", "zone_name": "example.com" }],
  "vars": { "PREVIEW_HOSTNAME": "preview.example.com" }
}
```

## The run log uses core's run driver

The coordinator drives each run with **core's run driver**, `RunController` from `@tanstack/ai-sandbox`. Two adapters bind it to the Durable Object run log (`DurableObjectRunEventLog`):

- `runLogStore` exposes the log as core's `RunStore`.
- `runLogStream` exposes one run of it as core's `StreamDurability`.

Both come from `@tanstack/ai-sandbox-cloudflare/agent`, for apps that compose the pieces themselves. They are why the portable tools (`alignToStoredLog`, `replayRunStream`) work on the Durable Object log the same way as on `memoryStream` or `durableStream`.

The words are core's too:

- Statuses are `completed`, `failed`, and `aborted`.
- The record is core's `RunRecord`, plus the log's own `lastSeq` cursor (`RunLogRecord`).
- `GET /runs/:id` and the WebSocket's final `status` frame use these status strings and field names.

1.0 does not read 0.x run records (`done` or `error` statuses, `createdAt` / `updatedAt` fields). Reading one throws an error. Before you upgrade, let in-flight runs finish or delete them, then clear the old `rec:` keys from the Durable Object storage.

The [journal](./journal) keeps its job on the driver side: warm reattach, and the driver's resume position. The rule is the portable one: **the log wins for what clients see, and the journal wins for where the driver resumes.**

What is specific to Cloudflare is the Durable Object's supervised lifetime. The driver outlives any request, and `alarm()` gives it a scheduler. Off Cloudflare, [takeover](./takeover) does that job, which is why the journal is required on every tier.

## Three layers, three homes

Keep these apart. Each one lives somewhere different on Cloudflare. Mixing them up is how workspace files end up "durably" in `/tmp`.

| Layer | Where it lives on Cloudflare | See |
| --- | --- | --- |
| Run and events | The coordinator's run log, in Durable Object storage | [The Run Journal](./journal), [Takeover](./takeover) |
| Workspace (files the agent edits) | The container filesystem. **Not durable.** Provision it again on create. | [Workspace](./workspace), [Provisioning](./provisioning) |
| Artifacts (outputs worth keeping) | R2, through a persistence `BlobStore` or `ArtifactStore` | [Keep generated files](../persistence/keep-generated-files) |

## What edge durability does not cover

- **The journal is not durable here.** `cloudflareSandbox` declares `durableFilesystem: false`. The `/tmp` journal lives as long as the container. On this tier, the Durable Object log is the durable copy, and the journal is only for driver recovery. Never treat the journal as the store of record.
- **Safe reconnects are not sleep survival.** The log makes reconnecting clients safe. It does not keep the container awake. If the container stops, the agent dies mid-run, and the log keeps what it emitted up to then.
- **`sleepAfter` can stop a quiet detached run.** The Sandbox class's idle timeout counts activity, not agent CPU. Nobody connected and no bridge calls looks idle. Set it above your longest quiet stretch. See the warning in [Durable runs at the edge](./cloudflare#durable-runs-at-the-edge).
