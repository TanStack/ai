---
name: ai-sandbox
description: >
  Run harness adapters (Claude Code) INSIDE isolated sandboxes via
  defineSandbox + withSandbox + a provider (localProcessSandbox / dockerSandbox).
  Covers defineWorkspace (git/setup/scripts/skills/secrets), defineSandboxPolicy
  (allow/ask/deny), lifecycle/resume, the SandboxHandle (fs/git/process/ports),
  capability tokens, and the file.changed / claude-code.session-id events. Use
  whenever a harness adapter needs a sandbox or when building sandbox providers.
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

## Events

- `claude-code.session-id` (CUSTOM) — resumable session id → pass back via
  `modelOptions.sessionId`.
- `file.changed` (CUSTOM) — `{ path, diff }` working-tree diff after the run.

## Critical rules

- **Harness adapters require a sandbox.** Always include `withSandbox(...)` in
  `middleware` — without it `chat()` throws a missing-capability error.
- **Secrets** (`workspace.secrets`, e.g. `ANTHROPIC_API_KEY`) are injected into
  the sandbox env and never persisted. The agent binary (`claude`) must exist in
  the sandbox image (install it in `setup` or bake it into the image).
- **chat()-provided `tools` are not yet bridged** into the in-sandbox Claude
  Code adapter — the agent uses its own native tools. Passing `tools` errors.
- Use `localProcessSandbox()` only in trusted/dev contexts (no isolation).
