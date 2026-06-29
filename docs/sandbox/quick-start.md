---
title: Quick Start
id: quick-start
description: "Run a Claude Code coding agent inside a sandbox, fix a bug in a cloned repo, and stream the diff — in minutes."
---

You have an app that already calls `chat()`, and you have an `ANTHROPIC_API_KEY`
(or you've run `claude login`). By the end of this guide a Claude Code agent will
clone a repo into a Docker sandbox, fix a bug, and stream the resulting `git diff`
back to you.

If you only want concepts first, read the [Overview](./overview). Otherwise, start
here.

## 1. Install the packages

```bash
npm i @tanstack/ai @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
```

- `@tanstack/ai` — the core `chat()` pipeline.
- `@tanstack/ai-claude-code` — the Claude Code **harness adapter**.
- `@tanstack/ai-sandbox` — `defineSandbox`, `defineWorkspace`, `withSandbox`.
- `@tanstack/ai-sandbox-docker` — the Docker **provider** that runs the agent in a
  container.

You'll also need Docker running locally. (No Docker? See
[the local-process alternative](#no-docker-run-on-your-host) below.)

## 2. Define the sandbox

A sandbox bundles three things: a **provider** (the isolation primitive — here,
Docker), a **workspace** (what the agent sees — here, a cloned git repo plus a
setup step), and a **lifecycle** (when to reuse, snapshot, and tear it down).

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
    // Where the working tree comes from (shallow clone by default).
    source: githubRepo({ repo: 'owner/buggy-app' }),
    packageManager: 'pnpm',
    // Commands that run once during bootstrap.
    setup: ['corepack enable', 'pnpm install'],
    // Injected into the sandbox env at create/resume — never persisted to
    // snapshots, the sandbox store, or the event log.
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})
```

`snapshot: 'after-setup'` (the default when the provider supports snapshots) means
the next run resumes from a post-`pnpm install` snapshot instead of re-cloning and
re-installing — so only the first run pays the cold-start cost.

For everything `defineWorkspace()` can describe — package manager auto-detection,
parallel setup groups, clone depth — see [Workspace](./workspace).

## 3. Call `chat()` with the harness adapter

The Claude Code adapter declares that it `requires` a sandbox capability.
`withSandbox(...)` is the middleware that **provides** it: it resumes-or-creates
the sandbox, bootstraps the workspace, and tears it down per the lifecycle.

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withSandbox } from '@tanstack/ai-sandbox'
import { messages, threadId } from './chat-context'
import { repoSandbox } from './sandbox'

const stream = chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  middleware: [withSandbox(repoSandbox)],
})
```

Here `messages` is your conversation (e.g. a user turn asking the agent to fix the
bug), and `threadId` keys the sandbox so the same thread reuses the same container.
Spawning `claude` happens **inside** the sandbox; its events stream back as normal
`chat()` chunks.

## 4. Stream the result and read the diff

Harness runs emit standard AG-UI chunks (text, tool calls, reasoning) plus a
namespaced `CUSTOM` event. When the run finishes, the Claude Code adapter emits a
`file.changed` event carrying the working-tree `git diff`:

```ts
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

That `diff` is point B: the agent cloned the repo, found the bug, edited the files,
and you printed the change it made — all without the agent touching your host
filesystem.

## No Docker? Run on your host

Swap the provider for the local-process one to skip Docker entirely. It runs the
agent directly on your host (no isolation), which makes for the fastest dev loop:

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

Because local-process inherits your host environment, you can drop the
`ANTHROPIC_API_KEY` secret and let Claude Code fall back to your `claude login`
subscription. For that (and for Daytona, Vercel, and Cloudflare runtimes), see
[Providers](./providers).

## Run the working example

A complete, runnable version of this guide ships at
[`examples/sandbox-coding-agent`](https://github.com/TanStack/ai/tree/main/examples/sandbox-coding-agent):
it clones a tiny repo with a deliberate bug, asks Claude Code to fix it, streams the
agent's output, and prints the diff. Run it with Docker or with `SANDBOX=local` on
your host (it needs `ANTHROPIC_API_KEY`).

From here:

- Give the agent your own server-side tools (DB lookups, secrets) — see [Tools](./tools).
- Lock down what the agent is allowed to run — see [Policy](./policy).
- Watch every file the agent touches as it works — see [Events](./events).
