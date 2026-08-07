---
title: Quick Start
id: quick-start
order: 2
description: "Clone a repo into a Docker sandbox, run Grok Build, stream the git diff."
---

**Must:** Docker running, packages installed, `XAI_API_KEY` (or grok.com login). Concepts first? → [Overview](./overview).

## 1. Install

```bash
npm i @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
```

| Package | Role |
| --- | --- |
| `@tanstack/ai` | `chat()` |
| `@tanstack/ai-grok-build` | harness adapter |
| `@tanstack/ai-sandbox` | `defineSandbox`, `withSandbox` |
| `@tanstack/ai-sandbox-docker` | Docker provider |

The **`grok` CLI must be available in the sandbox image** (spawned inside the container). No Docker? → [local process](#no-docker-run-on-your-host).

## 2. Define the sandbox

```ts
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

export const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/buggy-app' }),
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})
```

`snapshot: 'after-setup'` (default when the provider supports snapshots) → later runs resume post-install instead of re-cloning. Secrets never persist to snapshots, the sandbox store, or the event log.

Full workspace options → [Workspace](./workspace).

## 3. Call `chat()` with the harness

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { messages, threadId } from './chat-context'
import { repoSandbox } from './sandbox'

const stream = chat({
  threadId,
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withSandbox(repoSandbox)],
})
```

`threadId` keys reuse of the same container. `grok` spawns **inside** the sandbox; events stream as normal `chat()` chunks.

## 4. Stream and print the diff

On finish, Grok Build emits `file.changed` with the working-tree `git diff`:

```ts
import { stream } from './my-run'

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta)
  }

  if (chunk.type === 'CUSTOM' && chunk.name === 'file.changed') {
    const value = chunk.value
    if (value !== null && typeof value === 'object' && 'diff' in value) {
      console.log('\n--- diff ---\n')
      console.log(value.diff)
    }
  }
}
```

## No Docker? Run on your host

Fastest dev loop; **no isolation** — trusted/dev only.

```bash
npm i @tanstack/ai-sandbox-local-process
```

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { defineSandbox, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

export const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: localProcessSandbox(),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/buggy-app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  lifecycle: { reuse: 'thread' },
})
```

Host env is inherited — drop the secret and use grok.com login if you prefer. Other providers → [Providers](./providers).

## Working examples

- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web) — durable Docker agent + preview URL.
- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare) — edge; pick harness in the UI.

**Optional next:** [Tools](./tools) · [Policy](./policy) · [Events](./events)
