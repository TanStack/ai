---
id: overview
order: 1
title: Sandboxes Overview
description: "Run a coding agent in an isolated sandbox with a real filesystem and stream its work through chat()."
---

If you need an agent to **edit a real repo** (not only talk about code) → use a sandbox.

A sandbox gives the agent a filesystem, shell, processes, and a cloned repository. Point a **harness adapter** at it through `chat()`; edits, commands, and tool calls stream back as normal chat chunks.

Same app code runs on a laptop, in CI, in Docker, or at the edge. Only the **provider** changes.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { messages, threadId } from './chat-context'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'TanStack/ai' }),
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    scripts: { test: 'pnpm test', typecheck: 'pnpm test:types' },
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

chat({
  threadId,
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withSandbox(repoSandbox)],
})
```

## Three parts (swap any one)

| Part | Role | You pick with |
| --- | --- | --- |
| **Provider** | Where the agent runs | `dockerSandbox`, `localProcessSandbox`, … |
| **Workspace** | What the agent sees (repo, setup, secrets) | `defineWorkspace({ … })` |
| **Harness** | Which agent runs | `grokBuildText`, `claudeCodeText`, `codexText`, `opencodeText`, or `acpCompatible` |

1. `defineSandbox()` binds provider + workspace (+ optional policy, lifecycle, hooks).
2. `withSandbox(definition)` is the `chat()` middleware that turns it on.

### Run order

```txt
chat({ adapter: grokBuildText(), middleware: [withSandbox(repoSandbox)] })
  │
  ├─ withSandbox.setup    → resume → restore snapshot → create + bootstrap
  ├─ adapter.chatStream   → spawn agent INSIDE sandbox; stream AG-UI chunks
  └─ withSandbox.onFinish → snapshot / destroy per lifecycle
```

Harness adapters declare `requires: [SandboxCapability]`. `chat()` fails fast if no middleware provides a sandbox.

## When to use it

| Need | Use |
| --- | --- |
| Agent acts on a real codebase (CI triage, PR review, preview, evals) | Sandbox |
| Model only reads code already in memory | Normal `chat()` + [tools](../tools/server-tools) |

## Next

1. [Quick Start](./quick-start) — agent fixes a bug on your laptop.
2. [Providers](./providers) · [Harnesses](./harnesses) · [Workspace](./workspace)
3. [Tools](./tools) · [Policy](./policy) · [Lifecycle](./lifecycle)
4. [Durability](./durability) · [Durable Runs](./durable-runs) · [Events](./events)

## Try it

- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web) — Docker, durable runs, live preview URL.
- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare) — edge; pick harness per run in the UI.
