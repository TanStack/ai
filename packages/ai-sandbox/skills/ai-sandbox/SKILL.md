---
name: ai-sandbox
description: >
  Run harness adapters (Claude Code) INSIDE isolated sandboxes via
  defineSandbox + withSandbox + a provider (localProcessSandbox / dockerSandbox).
  Covers defineWorkspace (git/setup/scripts/skills/secrets), defineSandboxPolicy
  (allow/ask/deny), lifecycle/resume, the SandboxHandle (fs/git/process/ports),
  capability tokens, defineSandbox hooks (onFile/onFileCreate/onFileChange/
  onFileDelete/onReady/onError/onDestroy) + fileEvents flag, chat middleware
  sandbox group (defineChatMiddleware sandbox hooks), the sandbox debug category,
  watchWorkspace as a low-level building block, and the file.changed /
  sandbox.file / claude-code.session-id events. Use whenever a harness adapter
  needs a sandbox or when building sandbox providers.
type: sub-skill
library: tanstack-ai
library_version: '0.1.0'
sources:
  - 'TanStack/ai:docs/sandbox/overview.md'
---

# Sandboxes

Harness adapters declare `requires: [SandboxCapability]`. `chat()` errors unless
some middleware provides it — `withSandbox(...)` does. The adapter then runs the
agent CLI **inside** the sandbox and streams its events back.

## Setup — Claude Code in a Docker sandbox

```typescript
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' },
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    scripts: { test: 'pnpm test' },
    secrets: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' },
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

const stream = chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Providers

- `localProcessSandbox()` — runs on the host (no isolation; dev loop only).
- `dockerSandbox({ image })` — isolated container; snapshots, fork, resume-by-id.

Both implement the same `SandboxHandle`: `fs` (read/write/list/mkdir/remove/
rename/exists), `git` (clone/status/add/commit/push/pull/branch), `process`
(`exec` + duplex `spawn`), `ports.connect(port)`, `env.set`, optional
`snapshot()`/`fork()`, `destroy()`. Providers advertise support via
`capabilities()`; calling an unsupported optional method throws
`UnsupportedCapabilityError`.

## Policy

```typescript
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test'],
    ask: ['curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask', // deny > ask > allow
})
// pass to defineSandbox({ policy }); harness adapters map it to native permissions
```

## Lifecycle &amp; resume

`reuse: 'thread'` resumes one sandbox per `threadId`; the compound key folds in
provider + workspace hash + tenant so changing the repo/setup/image starts
fresh. Ensure order: resume running → restore snapshot → create + bootstrap.

## File-event hooks

Watch the workspace for create/change/delete events. Provider-agnostic: native
`fs.watch` on local-process, a portable `find` poll on Docker/exec-only
providers (no extra deps or image changes).

Declare hooks on `defineSandbox({ hooks })` (sandbox-scoped) or on any chat
middleware via the `sandbox` group (run-scoped):

```typescript
import { defineSandbox, defineChatMiddleware, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Sandbox-scoped hooks (all optional):
const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    onFile:       (e) => console.log(e.type, e.path), // catch-all
    onFileCreate: (e) => console.log('created', e.path),
    onFileChange: (e) => console.log('changed', e.path),
    onFileDelete: (e) => console.log('deleted', e.path),
    onReady:      (handle) => console.log('ready', handle.id),
    onError:      (err) => console.error(err),
    onDestroy:    () => console.log('destroyed'),
  },
  fileEvents: true, // default; set false to disable watching entirely
})

// Run-scoped hooks via chat middleware (ctx is ChatMiddlewareContext):
const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  sandbox: {
    onFile:       (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileCreate: (ctx, e) => db.log({ run: ctx.runId, event: e }),
    onFileChange: (ctx, e) => metrics.increment('file.change'),
    onFileDelete: (ctx, e) => console.warn('deleted', e.path),
  },
})

// No extra middleware needed — sandbox.file CUSTOM events are emitted
// automatically. Read them from the stream:
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
    const value = chunk.value
    if (value !== null && typeof value === 'object' && 'type' in value && 'path' in value) {
      console.log('file event', value) // { type, path, timestamp }
    }
  }
}
```

`watchWorkspace()` is available as a low-level building block for watching
outside a `chat()` run:

```typescript
import { watchWorkspace } from '@tanstack/ai-sandbox'

const watcher = await watchWorkspace(handle, {
  onEvent: (e) => console.log(e.type, e.path),
  ignore: ['.git', 'node_modules'], // default
})
await watcher.stop()
```

Enable the `sandbox` debug category to log watcher start/stop, event dispatch,
and lifecycle transitions:

```typescript
chat({ threadId, adapter, messages, debug: { sandbox: true } })
// or debug: true to enable all categories
```

## Events

- `claude-code.session-id` (CUSTOM) — resumable session id → pass back via
  `modelOptions.sessionId`.
- `file.changed` (CUSTOM) — `{ path, diff }` working-tree diff after the run.
- `sandbox.file` (CUSTOM) — `{ type, path, timestamp }` per file create/change/
  delete, emitted automatically when a sandbox is active.

## Critical rules

- **Harness adapters require a sandbox.** Always include `withSandbox(...)` in
  `middleware` — without it `chat()` throws a missing-capability error.
- **Secrets** (`workspace.secrets`, e.g. `ANTHROPIC_API_KEY`) are injected into
  the sandbox env and never persisted. The agent binary (`claude`) must exist in
  the sandbox image (install it in `setup` or bake it into the image).
- **chat()-provided `tools` are bridged** into the in-sandbox agent over a
  host-side MCP tool-proxy: the agent calls them as `mcp__tanstack__<tool>` and
  each call is proxied back to the host where the tool's `execute()` runs (with
  its closures / DB / secrets). The agent also has its own native tools
  (Bash/Edit/Read/…). The host bridge binds on the host; the sandbox reaches it
  (localhost, or `host.docker.internal` for Docker), gated by a per-run bearer
  token.
- Use `localProcessSandbox()` only in trusted/dev contexts (no isolation).
