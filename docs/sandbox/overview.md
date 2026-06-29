---
id: overview
title: Sandboxes Overview
---

Sandboxes let **harness adapters** (coding agents like Claude Code) run inside
an isolated environment — with a real filesystem, processes, and a cloned repo —
and stream their work back through `chat()`. The same code runs on your laptop,
in CI, in a Docker container, or on the edge: only the **provider** changes.

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { createSecrets, defineSandbox, defineWorkspace, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: { type: 'git', url: 'https://github.com/TanStack/ai' },
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    scripts: { test: 'pnpm test', typecheck: 'pnpm test:types' },
    secrets: createSecrets({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  middleware: [withSandbox(repoSandbox)],
})
```

## Mental model

- **`chat()`** owns the execution pipeline.
- **The adapter** decides _how_ a chat executes. A **harness adapter** (e.g.
  `claudeCodeText`) runs an external agent runtime and declares
  `requires: [SandboxCapability]` — `chat()` errors at the call site if no
  middleware provides a sandbox.
- **`withSandbox(...)`** is middleware that _provides_ the `SandboxCapability`:
  it resumes-or-creates the sandbox, bootstraps the workspace, and tears it
  down per the lifecycle.

```txt
chat({ adapter: claudeCodeText(), middleware: [withSandbox(repoSandbox)] })
  │
  ├─ withSandbox.setup   → ensure sandbox (resume → restore snapshot → create + bootstrap), provide handle
  ├─ adapter.chatStream  → spawn `claude` INSIDE the sandbox, stream its events back as AG-UI chunks
  └─ withSandbox.onFinish→ snapshot / destroy per lifecycle
```

## Providers

A provider owns the isolation primitive. All implement the same
`SandboxProvider` / `SandboxHandle` contract, so adapters and workspaces are
provider-agnostic.

| Provider | Package | Isolation | Notes |
| --- | --- | --- | --- |
| Local process | `@tanstack/ai-sandbox-local-process` | none (host) | The fast, no-Docker dev loop. Trusted/dev use only. |
| Docker | `@tanstack/ai-sandbox-docker` | container | Real isolation; commit-based snapshots, fork, resume-by-id. |
| Daytona | `@tanstack/ai-sandbox-daytona` | cloud sandbox | Managed [Daytona](https://www.daytona.io/) sandboxes; port preview links, resume-by-id. Needs `DAYTONA_API_KEY`. |
| Vercel | `@tanstack/ai-sandbox-vercel` | microVM | Managed [Vercel Sandbox](https://vercel.com/docs/sandbox) microVMs; exposed-port domains, resume-by-id (persistent). Needs `VERCEL_TOKEN` + team/project. |

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const dev = localProcessSandbox() // runs on your host
const isolated = dockerSandbox({ image: 'node:22' }) // runs in a container
const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY }) // managed cloud sandbox
const vercel = vercelSandbox({ runtime: 'node24' }) // managed Vercel microVM
```

#### Use a host CLI's own auth (`scrubEnv`)

`localProcessSandbox` runs the harness on your host, so it inherits your host
environment. Use `scrubEnv` to remove vars before spawning — e.g. drop
`ANTHROPIC_API_KEY` so Claude Code falls back to your logged-in **subscription**
(`claude login`) instead of billing the API:

```ts
const subscription = localProcessSandbox({ scrubEnv: ['ANTHROPIC_API_KEY'] })
```

Only local-process can do this (it runs your host CLI); isolated/cloud providers
have no host login and use an injected API key.

Providers declare what they support via `capabilities()`
(`fs`, `exec`, `env`, `ports`, `backgroundProcesses`, `snapshots`,
`networkPolicy`, `durableFilesystem`, `fork`). Code that uses an optional
capability checks the flag first and degrades gracefully; calling an
unsupported optional method throws `UnsupportedCapabilityError`.

## Workspace

`defineWorkspace()` describes what the agent sees. It is portable; each harness
adapter projects it into its own native format.

```ts
import { createSecrets, defineWorkspace } from '@tanstack/ai-sandbox'

defineWorkspace({
  // Where the working tree comes from.
  source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' },
  // Package manager (auto-detected from the lockfile when omitted).
  packageManager: 'pnpm',
  // Commands run once during bootstrap.
  setup: ['corepack enable', 'pnpm install'],
  // Named commands the agent can run.
  scripts: { test: 'pnpm test', build: 'pnpm build' },
  // Injected into the sandbox env at create/resume — never persisted to
  // snapshots, the sandbox store, or the event log.
  secrets: createSecrets({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' }),
})
```

## Provisioning (secrets, skills, plugins, MCP, instructions)

`defineWorkspace()` supports declarative provisioning of the agent environment:
secrets, third-party MCP servers, skill repos, plugins, and a universal
`AGENTS.md` instruction file — all portable across harnesses.

### Type-safe secrets

`createSecrets` wraps environment values into opaque `SecretRef` tokens.
The underlying strings are stored in a non-enumerable symbol-keyed registry on
the returned object, so `Object.keys(secrets)` never exposes them and they are
never written to snapshots, the sandbox store, or the event log.

```ts
import { createSecrets, bearer, defineWorkspace } from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

defineWorkspace({
  source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' },
  secrets,
  // ...
})
```

Pass `secret: secrets.GH` wherever a `SecretRef` is accepted (e.g. `gitSkill`
auth). In MCP header values use the ref directly or wrap it with `bearer(ref)`
to produce a `Bearer <value>` string at resolution time:

```ts
import { mcpSkill } from '@tanstack/ai-sandbox'

mcpSkill('my-mcp', {
  url: 'https://mcp.example.com',
  headers: {
    Authorization: bearer(secrets.SENTRY), // resolves to "Bearer <value>"
    'X-Token': secrets.GH,                 // resolves to the raw token value
  },
})
```

### Skills, plugins, and MCP servers

`skills` is an array of `WorkspaceSkill` values. During bootstrap each harness
projector maps them to its native format (Claude Code `.mcp.json`, Codex
`.codex/config.toml`, OpenCode `opencode.json`).
Concepts that a given CLI lacks (e.g. plugins in Codex) emit a warning and are
silently skipped rather than throwing.

```ts
import {
  agentSkill,
  gitSkill,
  mcpSkill,
  fileSkill,
  defineWorkspace,
} from '@tanstack/ai-sandbox'

defineWorkspace({
  source: { type: 'git', url: 'https://github.com/owner/repo' },
  secrets,
  skills: [
    // Load a public agent skill by name (Claude Code only; no-op with warning on others).
    agentSkill('tanstack'),
    // Clone a private skill repo; `secret` is resolved from the secrets registry.
    gitSkill({ repo: 'owner/private-skills', secret: secrets.GH }),
    // Wire an MCP server with a resolved bearer token in the Authorization header.
    mcpSkill('my-mcp', {
      url: 'https://mcp.example.com',
      headers: { Authorization: bearer(secrets.SENTRY) },
    }),
    // Write an arbitrary file into the workspace.
    fileSkill({ path: '.agent-hints.md', content: '# Hints\nPrefer pnpm.' }),
  ],
  plugins: ['@anthropic/plugin-foo'],
  instructions: 'Always run `pnpm test` before proposing a change.',
})
```

`gitSkill` has an optional `into` field (an **absolute path inside the sandbox**;
defaults to `.tanstack-skills/<repo-basename>`) that controls where the repo is
cloned.

### AGENTS.md and per-harness symlinks

`instructions` is written to `AGENTS.md` at the workspace root during bootstrap.
Harness-specific counterparts (`CLAUDE.md`, `GEMINI.md`) are created as symlinks;
if the sandbox process layer cannot symlink, they are written as copies. The
instruction content is therefore read natively by every supported CLI without
extra config.

## Policy

`defineSandboxPolicy()` is a portable allow/ask/deny description that each
harness adapter maps onto its native permission system. Precedence is
`deny` > `ask` > `allow`, with a configurable `default`.

```ts group=overview
import { defineSandboxPolicy,  defineSandbox } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask',
})

const sandbox = defineSandbox({ id: 'repo', provider, policy /* … */ })
```

## Fast init (shallow clone, serial/parallel setup, snapshots)

### Shallow clone by default

`githubRepo` and `gitSource` default to a shallow single-branch clone
(`--depth 1 --single-branch`). Pass a `depth` number for a specific history
depth, or `'full'` to fetch everything:

```ts
import { githubRepo, defineWorkspace } from '@tanstack/ai-sandbox'

defineWorkspace({
  // Shallow clone (depth 1) — the default.
  source: githubRepo({ repo: 'owner/app' }),
})

defineWorkspace({
  // Explicit depth — fetches last 10 commits.
  source: githubRepo({ repo: 'owner/app', depth: 10 }),
})

defineWorkspace({
  // Full history — disables the depth flag entirely.
  source: githubRepo({ repo: 'owner/app', depth: 'full' }),
})
```

### Serial and parallel setup

`setup` accepts either a plain string array (all steps run serially) or a
callback that records serial and parallel groups over a **persistent shell** —
the shell's working directory and environment carry over between steps, so a
`cd` or `export` in a serial step is visible to the next one.

```ts
import { defineWorkspace } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ({ serial, parallel }) => {
    // Runs in order on the persistent shell; cwd/env carry over.
    serial('corepack enable')
    serial('pnpm install')
    // Both commands launch concurrently, inheriting cwd+env from the shell.
    parallel(['pnpm build', 'pnpm typecheck'])
    // Runs after both parallel steps complete.
    serial('echo bootstrap done')
  },
})
```

A plain string array is equivalent to all-serial and remains the simplest form:

```ts
defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ['corepack enable', 'pnpm install'],
})
```

### Snapshot-after-setup

When the sandbox provider supports snapshots (e.g. Docker), bootstrap
automatically takes a snapshot after `setup` completes. Subsequent runs resume
from the snapshot instead of re-running the setup steps, dramatically reducing
cold-start time.

Control snapshot behaviour via `lifecycle`:

```ts
import { defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  lifecycle: {
    reuse: 'thread',
    // 'after-setup' is the default when the provider supports snapshots.
    snapshot: 'after-setup',
    // Optional: re-create (re-bootstrap) when the snapshot is older than this.
    snapshotMaxAge: '24h',
  },
})
```

`snapshotMaxAge` accepts a duration string (`'24h'`, `'30m'`, etc.). When the
stored snapshot is older than the limit, `withSandbox` treats it as stale and
re-creates the sandbox from scratch. Providers without snapshot support
(e.g. `localProcessSandbox`) skip the snapshot step silently.

## Tools

The agent always has its own native tools (Bash, file edits, search) inside the
sandbox. In addition, `chat()`-provided server tools are **bridged** to the
in-sandbox agent over a host-side MCP tool-proxy: the agent calls them, each call
is proxied back to the host where the tool's `execute()` runs (keeping its
DB/secrets/closures), and the result is returned into the sandbox. The bridge is
gated by a per-run bearer token; the sandbox reaches the host on `localhost`
(local-process) or `host.docker.internal` (Docker).

```ts
chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  tools: [getTodos.server(async ({ userId }) => db.todos.find({ userId }))],
  middleware: [withSandbox(sandbox)],
})
```

### Reaching the bridge from a remote sandbox

The bridge is an HTTP endpoint the **sandbox calls back to**, so the sandbox must
be able to open a connection to your orchestrator. That holds in two cases and
breaks in a third:

- **Local process / Docker** — the orchestrator is the same machine, reached on
  `localhost` / `host.docker.internal`. Bridged tools work with no extra setup.
- **A deployed orchestrator (production)** — it already has a public URL, so the
  bridge is reachable out of the box. The provisioner advertises your public host
  (derived from the incoming request) instead of `localhost`, and every call is
  gated by a random per-run bearer token, so the public endpoint is not an open
  door. This is the same path the serverless/edge model uses (see
  [Edge execution](#edge-execution-two-models)).
- **A remote cloud sandbox driven from your laptop** (Daytona, Vercel in local
  dev) — the sandbox is a remote VM and **cannot dial your machine's
  `localhost`**, and your laptop has no public URL. Bridged tools / code mode
  can't reach the host until you expose the bridge.

For that last case, the `@tanstack/ai-sandbox/ngrok` subpath tunnels the loopback
bridge through [ngrok](https://ngrok.com) so a remote sandbox can reach it. Set
`NGROK_AUTHTOKEN`, then add `withNgrokBridge` after `withSandbox(...)`:

```ts
import { withNgrokBridge } from '@tanstack/ai-sandbox/ngrok'

chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  tools: [getTodos.server(async ({ userId }) => db.todos.find({ userId }))],
  // Cloud provider in local dev → tunnel the host bridge so the remote sandbox
  // can reach it. Local process / Docker don't need this.
  middleware: [withSandbox(sandbox), withNgrokBridge],
})
```

`@ngrok/ngrok` is an **optional peer dependency** — install it alongside the
subpath (`npm i @ngrok/ngrok`). `withNgrokBridge` is purely a local-dev
convenience: in production your deployed orchestrator is already reachable, so you
ship without it.

### Edge execution: two models

Where the harness loop and its MCP tool-bridge run is a deployment choice, and
the layer supports two shapes:

- **DO-drives-container** (the default). The orchestrator runs `chat()` and the
  tool-bridge; the container only runs the agent CLI. The bridge is served from
  the orchestrator (a serverless `fetch` handler, no raw TCP listener) and the
  agent reaches it across the container→orchestrator boundary, so the **whole MCP
  protocol** crosses that boundary. The `examples/sandbox-cloudflare`
  TanStack Start app demonstrates this — UI, agent, Durable Objects, and the
  container in one Worker.
- **Co-located (in-container).** The harness loop AND the tool-bridge run inside
  the container (the in-container sandbox is just `local-process`, with native
  stdin and a localhost `node:http` bridge). The only thing that still crosses
  back to the orchestrator is host **tool execution** — a `chat()` tool's
  `execute()` closure (DB, secrets, app state) lives there, not in the
  container. Enable it with `createCloudflareSandboxAgent({ mode: 'colocated' })`
  plus a `runInContainerHarness` container program from
  `@tanstack/ai-sandbox-cloudflare/runner`.

The co-located seam is four exports from `@tanstack/ai-sandbox`. The orchestrator
serializes its tools with `toolDescriptors(tools)` and ships the descriptors in;
the container rebuilds them with `remoteToolStubs(descriptors, executor)`, where
each stub's `execute()` delegates to a `RemoteToolExecutor`
(`httpRemoteToolExecutor(url, token)` POSTs `{ name, args }` back). The
orchestrator answers that one call with `executeHostTool(tools, name, args)`,
which runs the real tool. So the public surface shrinks from the whole MCP
protocol to a single authenticated tool-exec call:

```ts
import { remoteToolStubs, httpRemoteToolExecutor } from '@tanstack/ai-sandbox'

// Inside the container: the orchestrator POSTed `{ messages, toolDescriptors,
// toolExecUrl, toolExecToken }`. Rebuild its tools as stubs whose execute()
// POSTs back; the adapter bridges them over the in-container localhost MCP
// transport, and only that one tool-exec call leaves the container.
chat({
  threadId: request.threadId,
  adapter: claudeCodeText('sonnet'),
  messages: request.messages,
  tools: remoteToolStubs(
    request.toolDescriptors,
    httpRemoteToolExecutor(request.toolExecUrl, request.toolExecToken),
  ),
  middleware: [withSandbox(localProcessSandbox())],
})
```

### Callback hosts (bridge vs preview)

In both edge models the sandbox **container is off-isolate compute** — it can't use
a service binding or an in-process call to reach the Worker, only the network. So the
container's callback URLs need real hosts. There are **two distinct surfaces**, with
different reachers and therefore different correct values — resolved by
`resolveBridgeOrigin` and `resolvePreviewHost` (both exported from
`@tanstack/ai-sandbox-cloudflare/agent`).

**Bridge / tool-exec** (container → Worker: `/_bridge`, `/tool-exec`). Just needs to
*reach* the Worker. `PUBLIC_HOSTNAME` is optional — when unset, the host is derived
from the `POST /runs` trigger request, so a `*.workers.dev` deploy works with **zero
config**, and **local dev uses `host.docker.internal`** (the Docker host gateway, over
`http`) — no tunnel. Request-derivation is safe **on Cloudflare**, where it would be
unsafe on a generic Node server: the edge dispatches a request to your Worker only
when its hostname matches a route you own, so the request `Host` is always one of
your own hostnames — never attacker-chosen — and the per-run bearer token that rides
the URL can't be steered off-domain. (On plain Node the `Host` header is
attacker-controlled, which is why this would be a token-exfil / SSRF vector there.)

**Preview** (browser → Worker → container: `exposePort`). Needs **wildcard DNS**, so
`PREVIEW_HOSTNAME` is a *separate* knob. **Local** uses `*.localhost` (browsers
resolve it to loopback with zero setup — previews work locally with no tunnel).
**Deployed** needs a **custom domain** with a `*.<domain>` route: `*.workers.dev` has
no wildcard subdomains, so the SDK's `exposePort` rejects it and `resolvePreviewHost`
throws a clear error pointing at `PREVIEW_HOSTNAME` instead of failing deep in a run.

### Exposing a preview (via a quick tunnel)

The package ships the browser-preview wiring so you don't hand-roll it, both
exported from `@tanstack/ai-sandbox-cloudflare/agent`:

- **`exposePreviewTool(input, env)`** — a ready-made `chat()` server tool (the agent
  sees it as `exposePreview`). It addresses the run's container by `threadId` and
  opens a **Cloudflare quick tunnel** to the port the dev server is on
  (`sandbox.tunnels.get(port)`), returning a `https://<name>.trycloudflare.com` URL.
- **`PREVIEW_GUIDANCE`** — a system prompt that tells the agent how to start a dev
  server whose tunnel preview works. App-agnostic on purpose.

The factory is **harness-agnostic about auth**: it binds no API key of its own.
Your app declares the key its harness needs (`ANTHROPIC_API_KEY` for Claude Code,
`CODEX_API_KEY` for Codex, …) on its own env type and supplies it as a workspace
secret — the coordinator injects each declared secret into the sandbox env by name.

```ts
import {
  PREVIEW_GUIDANCE,
  createCloudflareSandboxAgent,
  exposePreviewTool,
  resolvePreviewHost,
} from '@tanstack/ai-sandbox-cloudflare/agent'
import { cloudflareSandbox } from '@tanstack/ai-sandbox-cloudflare'
import { createSecrets, defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import type { SandboxAgentEnv } from '@tanstack/ai-sandbox-cloudflare/agent'

// Extend the package's harness-agnostic env with the key YOUR harness needs.
interface AppEnv extends SandboxAgentEnv {
  ANTHROPIC_API_KEY: string
}

export const agent = createCloudflareSandboxAgent<AppEnv>({
  adapter: () => claudeCodeText('sonnet'),
  systemPrompts: [PREVIEW_GUIDANCE],
  tools: (input, env) => [exposePreviewTool(input, env)],
  // Supply the harness's auth here — the package binds no key. The `sandbox`
  // resolver receives the Worker `env` per run, so the secret VALUE is read from
  // it. A non-Anthropic harness declares its own, e.g. `CODEX_API_KEY` for Codex.
  sandbox: (input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      provider: cloudflareSandbox({
        binding: env.Sandbox,
        previewHostname: resolvePreviewHost(env, input),
      }),
      workspace: defineWorkspace({
        source: { type: 'none' },
        secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }),
      }),
      lifecycle: { reuse: 'thread' },
    }),
})
```

> The Codex variant of this example lives at
> [`examples/sandbox-cloudflare-codex`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare-codex)
> — same edge topology, `codexText('gpt-5.3-codex')` + `CODEX_API_KEY` instead.

**Why a quick tunnel, not `exposePort`.** `exposePort` + `proxyToSandbox` routes the
preview through the Worker's own origin. In local dev that origin is your Vite dev
server, and Vite's middleware then serves the preview's module/asset requests
(`/@vite/client`, `/src/*`, `/@fs/*`) from your **host** instead of the container —
the page loads the wrong code and breaks. A quick tunnel is served by `cloudflared`
**inside** the sandbox (`cloudflared` ships in the `cloudflare/sandbox` base image),
so it bypasses the Vite port entirely, needs **no custom domain** on a deploy, and
forwards WebSockets — so the app's HMR works. The one requirement, which
`PREVIEW_GUIDANCE` instructs, is that the dev server **accept the tunnel hostname**
(servers reject unknown hosts): Vite `server: { host: true, allowedHosts: true }`,
webpack-dev-server `allowedHosts: 'all'`. (`exposePort` + `resolvePreviewHost`
remain available for apps that want the Worker to front the request on a custom
domain — see [Callback hosts](#callback-hosts-bridge-vs-preview).)

> **Transport:** `sandbox.tunnels` exists only on the SDK's **RPC** transport — on
> the default `http` it throws *"requires the RPC transport"*. So `cloudflareSandbox`
> defaults to `transport: 'rpc'` (and the example also sets `SANDBOX_TRANSPORT=rpc`
> for the Sandbox DO). The transport must match on every `getSandbox()` for an id, so
> a custom provider must pass `{ transport: 'rpc' }` too. Override to `'http'` only
> if you don't use tunnel previews.

## File-event hooks

Listen to files being created, changed, or deleted inside a sandbox — e.g. to
watch what the agent edits as it works. The watcher is provider-agnostic: it
uses native OS watching where the provider supports it (local-process) and falls
back to a portable `find` poll everywhere else (Docker and other exec-only
providers), with no extra dependencies or image changes.

Hooks are declared directly on `defineSandbox({ hooks })` (sandbox-scoped, fire
once per file event regardless of how many runs share the sandbox) or on any
chat middleware via the `sandbox` group (run-scoped, fired per-run):

```ts
import { defineSandbox, defineChatMiddleware, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Sandbox-scoped hooks — declared once on the definition.
const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    // catch-all: fires for every event
    onFile:       (e) => console.log(`[${e.type}] ${e.path}`),
    // type-specific variants
    onFileCreate: (e) => console.log('created', e.path),
    onFileChange: (e) => console.log('changed', e.path),
    onFileDelete: (e) => console.log('deleted', e.path),
    // lifecycle
    onReady:   (handle) => console.log('sandbox ready', handle.id),
    onError:   (err)    => console.error('sandbox error', err),
    onDestroy: ()       => console.log('sandbox destroyed'),
  },
})
```

To handle file events inside a run-scoped middleware (e.g. for per-request
audit logging), use the `sandbox` hook group on `defineChatMiddleware`:

```ts
const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  // ctx is the ChatMiddlewareContext for the current run
  sandbox: {
    onFile:       (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileCreate: (ctx, e) => db.log({ run: ctx.runId, event: e }),
  },
})
```

Both hook groups fire server-side. The engine automatically emits one `CUSTOM`
`sandbox.file` event per change into the stream — no extra middleware needed.
Read it from the `parts` array on the client:

```ts
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
    const value = chunk.value
    if (
      value !== null &&
      typeof value === 'object' &&
      'type' in value &&
      'path' in value
    ) {
      console.log('file event', value) // { type, path, timestamp }
    }
  }
}
```

To disable file watching for a sandbox entirely, set `fileEvents: false`:

```ts
const sandbox = defineSandbox({
  id: 'quiet-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  fileEvents: false, // watcher not started; no sandbox.file events emitted
})
```

To log sandbox internals (watcher start/stop, event dispatch, lifecycle
transitions), pass the `sandbox` debug category:

```ts
chat({ threadId, adapter, messages, debug: true })
// or selectively:
chat({ threadId, adapter, messages, debug: { sandbox: true } })
```

`watchWorkspace()` remains available as a low-level building block for using
the watcher outside a `chat()` run:

```ts
import { watchWorkspace } from '@tanstack/ai-sandbox'

const handle = await sandbox.ensure({ threadId, runId })
const watcher = await watchWorkspace(handle, {
  onEvent: (event) => {
    // event.type is 'create' | 'change' | 'delete'
    console.log(`${event.type} ${event.path}`)
  },
  ignore: ['.git', 'node_modules'], // default
})
// …do work outside a chat run…
await watcher.stop()
```

## Lifecycle &amp; resume

```ts
lifecycle: {
  reuse: 'thread',          // one sandbox per threadId ('none' = fresh per run)
  snapshot: 'after-setup',  // snapshot once bootstrapped (provider-permitting)
  keepAlive: '30m',         // hint to keep the sandbox warm between runs
  destroyOnComplete: false, // keep it for the next run
}
```

A sandbox is keyed by a compound `sandboxInstanceKey` =
`hash(threadId + sandbox.id + provider + workspaceHash + tenant?)`, so changing
the repo, setup, image, or tenant safely starts a fresh sandbox rather than
resuming a stale one. The ensure order is: **resume the running sandbox →
restore the latest snapshot → create fresh and bootstrap**. Providers without
durable disk or snapshots (e.g. ephemeral containers) re-create + re-bootstrap
under the same identity.

## Events

Harness runs stream standard AG-UI `StreamChunk`s (text, tool calls, reasoning,
run lifecycle) plus namespaced `CUSTOM` events for sandbox-specifics. Today the
in-sandbox Claude Code adapter emits:

- `claude-code.session-id` — the resumable harness session id.
- `file.changed` — the working-tree `git diff` after the run.
- `sandbox.file` — emitted per file create/change/delete automatically when a
  sandbox is active (see [File-event hooks](#file-event-hooks)).

```ts
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'file.changed') {
    const value = chunk.value
    if (value !== null && typeof value === 'object' && 'diff' in value) {
      console.log(value.diff)
    }
  }
}
```

## Try it

A runnable end-to-end demo lives at `examples/sandbox-coding-agent`: it clones a
tiny repo with a deliberate bug into a sandbox, asks Claude Code to fix it,
streams the agent's output, and prints the resulting diff. Run it with Docker or
with `SANDBOX=local` on your host (requires `ANTHROPIC_API_KEY`).

`examples/sandbox-issue-triage` goes further: it fetches the first open issue on
`TanStack/ai`, clones the repo into a sandbox, runs Claude Code to triage it, and
writes a Markdown report locally — using **file-event hooks** to log the agent's
edits live. It ships two entrypoints, `pnpm start:process` and `pnpm start:docker`.

For a **web** chat where the agent builds and runs an app inside a sandbox and
hands back a live preview URL, see `examples/sandbox-local-web` (Docker / local),
`examples/sandbox-daytona-web` (managed Daytona sandbox), and
`examples/sandbox-vercel-web` (Vercel microVM). The hosted-provider examples show
the no-bridge pattern: with the sandbox in the cloud, they pass `tools: []` and
pre-resolve the provider's public preview URL host-side instead of bridging a
host tool back into the sandbox.

> **Persistence-ready:** the sandbox layer ships with in-memory stores for
> resume bookkeeping. A future persistence package can provide durable
> `SandboxStore` / `LockStore` implementations (and event-log replay) by
> supplying those optional capabilities — no changes to the sandbox layer.
