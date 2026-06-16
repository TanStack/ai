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
import { defineSandbox, defineWorkspace, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: { type: 'git', url: 'https://github.com/TanStack/ai' },
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    scripts: { test: 'pnpm test', typecheck: 'pnpm test:types' },
    secrets: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' },
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

return chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  middleware: [withSandbox(repoSandbox)],
}).toResponse()
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
  secrets: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' },
})
```

## Policy

`defineSandboxPolicy()` is a portable allow/ask/deny description that each
harness adapter maps onto its native permission system. Precedence is
`deny` > `ask` > `allow`, with a configurable `default`.

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

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

> **Persistence-ready:** the sandbox layer ships with in-memory stores for
> resume bookkeeping. A future persistence package can provide durable
> `SandboxStore` / `LockStore` implementations (and event-log replay) by
> supplying those optional capabilities — no changes to the sandbox layer.
