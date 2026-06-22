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

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const dev = localProcessSandbox() // runs on your host
const isolated = dockerSandbox({ image: 'node:22' }) // runs in a container
```

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
`.codex/config.toml`, Gemini CLI settings JSON, OpenCode `opencode.json`).
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

### Edge execution: two models

Where the harness loop and its MCP tool-bridge run is a deployment choice, and
the layer supports two shapes:

- **DO-drives-container.** The orchestrator runs `chat()` and the tool-bridge;
  the container only runs the agent CLI. The bridge is served from the
  orchestrator (a serverless `fetch` handler, no raw TCP listener) and the agent
  reaches it across the container→orchestrator boundary, so the **whole MCP
  protocol** crosses that boundary. See `examples/sandbox-cloudflare-agent`.
- **Co-located (in-container).** The harness loop AND the tool-bridge run inside
  the container (the in-container sandbox is just `local-process`, with native
  stdin and a localhost `node:http` bridge). The only thing that still crosses
  back to the orchestrator is host **tool execution** — a `chat()` tool's
  `execute()` closure (DB, secrets, app state) lives there, not in the
  container. See `examples/sandbox-cloudflare-agent-colocated`.

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

> **Persistence-ready:** the sandbox layer ships with in-memory stores for
> resume bookkeeping. A future persistence package can provide durable
> `SandboxStore` / `LockStore` implementations (and event-log replay) by
> supplying those optional capabilities — no changes to the sandbox layer.
