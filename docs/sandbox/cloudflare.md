---
title: Cloudflare (Edge)
id: cloudflare
order: 11
description: "Run a coding-agent harness and a live preview at the edge with @tanstack/ai-sandbox-cloudflare — Workers, Containers, and Durable Objects in one deploy."
---

You want your coding agent to run **at the edge** — UI, agent loop, and the
sandbox container all in one Cloudflare Worker — and to hand users a **live
preview URL** of whatever the agent builds. `@tanstack/ai-sandbox-cloudflare`
provides the `cloudflareSandbox` provider plus a ready-made agent coordinator so
you don't hand-roll the Worker ↔ container plumbing.

This page covers the edge-specific concerns. For the provider-agnostic basics
(workspace, tools, policy, lifecycle) start at the [Overview](./overview).

## Two execution models

Where the harness loop and its [tool bridge](./tools) run is a deployment
choice. The Cloudflare layer supports two shapes.

### DO-drives-container (default)

The orchestrator (a Durable Object) runs `chat()` and the tool-bridge; the
container only runs the agent CLI. The bridge is served from the orchestrator's
own `fetch` handler — no raw TCP listener — and the agent reaches it across the
container → orchestrator boundary, so the **whole MCP protocol** crosses that
boundary. The `examples/sandbox-cloudflare` TanStack Start app demonstrates this:
UI, agent, Durable Objects, and the container in one Worker.

### Co-located (in-container)

The harness loop **and** the tool-bridge run inside the container — the
in-container sandbox is just `localProcessSandbox()`, with native stdin and a
localhost `node:http` bridge. The only thing that still crosses back to the
orchestrator is host **tool execution**: a `chat()` tool's `execute()` closure
(your DB, secrets, app state) lives on the orchestrator, not in the container.
The public surface shrinks from the whole MCP protocol to a single authenticated
tool-exec call.

Enable it with `createCloudflareSandboxAgent({ mode: 'colocated' })` plus a
`runInContainerHarness` container program from
`@tanstack/ai-sandbox-cloudflare/runner`. The seam is four exports from
`@tanstack/ai-sandbox`: the orchestrator serializes its tools with
`toolDescriptors(tools)` and ships the descriptors in; the container rebuilds
them with `remoteToolStubs(descriptors, executor)`, where each stub's `execute()`
delegates to a `RemoteToolExecutor` (`httpRemoteToolExecutor(url, token)` POSTs
`{ name, args }` back); the orchestrator answers that one call with
`executeHostTool(tools, name, args)`.

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

// Inside the container: the orchestrator POSTed `{ messages, toolDescriptors,
// toolExecUrl, toolExecToken }`. Rebuild its tools as stubs whose execute()
// POSTs back; the adapter bridges them over the in-container localhost MCP
// transport, and only that one tool-exec call leaves the container.
chat({
  threadId: request.threadId,
  adapter: grokBuildText('grok-build'),
  messages: request.messages,
  tools: remoteToolStubs(
    request.toolDescriptors,
    httpRemoteToolExecutor(request.toolExecUrl, request.toolExecToken),
  ),
  // The in-container sandbox is just local-process (native stdin + a localhost
  // node:http bridge).
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

## Callback hosts: bridge vs preview

In both models the container is **off-isolate compute** — it can't use a service
binding or an in-process call to reach the Worker, only the network. So the
container's callback URLs need real hosts. There are **two distinct surfaces**
with different reachers and therefore different correct values, resolved by
`resolveBridgeOrigin` and `resolvePreviewHost` (both from
`@tanstack/ai-sandbox-cloudflare/agent`).

- **Bridge / tool-exec** (container → Worker: `/_bridge`, `/tool-exec`). Just
  needs to *reach* the Worker. `PUBLIC_HOSTNAME` is optional — when unset, the
  host is derived from the `POST /runs` trigger request, so a `*.workers.dev`
  deploy works with **zero config**, and **local dev uses
  `host.docker.internal`** (the Docker host gateway, over `http`) — no tunnel.

  > Request-derivation is safe **on Cloudflare**, where it would be unsafe on a
  > generic Node server: the edge dispatches a request to your Worker only when
  > its hostname matches a route you own, so the request `Host` is always one of
  > your own hostnames — never attacker-chosen — and the per-run bearer token
  > that rides the URL can't be steered off-domain. On plain Node the `Host`
  > header is attacker-controlled, which is why request-derivation there would be
  > a token-exfil / SSRF vector. (See [Tools](./tools) for the non-edge bridge.)

- **Preview** (browser → Worker → container: `exposePort`). Needs **wildcard
  DNS**, so `PREVIEW_HOSTNAME` is a *separate* knob. **Local** uses `*.localhost`
  (browsers resolve it to loopback with zero setup — previews work locally with
  no tunnel). **Deployed** needs a **custom domain** with a `*.<domain>` route:
  `*.workers.dev` has no wildcard subdomains, so the SDK's `exposePort` rejects
  it and `resolvePreviewHost` throws a clear error pointing at `PREVIEW_HOSTNAME`
  instead of failing deep in a run.

## Exposing a live preview

The package ships the browser-preview wiring so you don't hand-roll it — both
exported from `@tanstack/ai-sandbox-cloudflare/agent`:

- **`exposePreviewTool(input, env)`** — a ready-made `chat()` server tool (the
  agent sees it as `exposePreview`). It addresses the run's container by
  `threadId` and opens a **Cloudflare quick tunnel** to the dev server's port
  (`sandbox.tunnels.get(port)`), returning a
  `https://<name>.trycloudflare.com` URL.
- **`PREVIEW_GUIDANCE`** — a system prompt that tells the agent how to start a
  dev server whose tunnel preview works. App-agnostic on purpose.

The factory is **harness-agnostic about auth**: it binds no API key of its own.
Your app declares the key its harness needs (`XAI_API_KEY` for Grok Build,
`ANTHROPIC_API_KEY` for Claude Code, `CODEX_API_KEY` for Codex, …) on its own env
type and supplies it as a [workspace secret](./provisioning) — the coordinator
injects each declared secret into the sandbox env by name.

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

// Extend the package's harness-agnostic env with the key YOUR harness needs.
interface AppEnv extends SandboxAgentEnv {
  XAI_API_KEY: string
}

export const agent = createCloudflareSandboxAgent<AppEnv>({
  adapter: () => grokBuildText('grok-build'),
  systemPrompts: [PREVIEW_GUIDANCE],
  tools: (input, env) => [exposePreviewTool(input, env)],
  // Supply the harness's auth here — the package binds no key. The `sandbox`
  // resolver receives the Worker `env` per run, so the secret VALUE is read from
  // it. A different harness declares its own, e.g. `ANTHROPIC_API_KEY` for Claude
  // Code or `CODEX_API_KEY` for Codex.
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

> The runnable example lives at
> [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare):
> one app that runs Claude Code, Codex, or Grok Build — pick the harness in the
> UI (or via the `HARNESS` var). Same edge topology, different adapter + key.

### Why a quick tunnel, not `exposePort`

`exposePort` + `proxyToSandbox` routes the preview through the Worker's own
origin. In local dev that origin is your Vite dev server, and Vite's middleware
then serves the preview's module/asset requests (`/@vite/client`, `/src/*`,
`/@fs/*`) from your **host** instead of the container — the page loads the wrong
code and breaks.

A quick tunnel is served by `cloudflared` **inside** the sandbox (`cloudflared`
ships in the `cloudflare/sandbox` base image), so it bypasses the Vite port
entirely, needs **no custom domain** on a deploy, and forwards WebSockets — so
the app's HMR works. The one requirement, which `PREVIEW_GUIDANCE` instructs, is
that the dev server **accept the tunnel hostname** (servers reject unknown
hosts): Vite `server: { host: true, allowedHosts: true }`, webpack-dev-server
`allowedHosts: 'all'`. (`exposePort` + `resolvePreviewHost` remain available for
apps that want the Worker to front the request on a custom domain.)

> **Transport:** `sandbox.tunnels` exists only on the SDK's **RPC** transport —
> on the default `http` it throws *"requires the RPC transport"*. So
> `cloudflareSandbox` defaults to `transport: 'rpc'` (and the example also sets
> `SANDBOX_TRANSPORT=rpc` for the Sandbox DO). The transport must match on every
> `getSandbox()` for an id, so a custom provider must pass `{ transport: 'rpc' }`
> too. Override to `'http'` only if you don't use tunnel previews.
