---
id: overview
order: 1
title: Sandboxes Overview
description: "Run coding-agent CLIs (Grok Build, Claude Code, Codex, OpenCode) inside an isolated sandbox with a real filesystem and a cloned repo, and stream their work back through chat()."
---

A **sandbox** gives a coding agent a real computer to work in: a filesystem, a
shell, processes, and a cloned repository. You point a **harness adapter** (a
coding-agent CLI like Grok Build) at it through `chat()`, and the agent's work (edits,
commands, tool calls) streams back to you like any other chat run.

The same code runs on your laptop, in CI, in a Docker container, or on the edge.
Only the **provider** changes.

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

`sbxSandbox()` from the same package runs the agent in a Docker Sandboxes microVM. See [Providers](./providers).

## The three moving parts

A sandboxed run is the composition of three independent pieces. You can change
any one without touching the others.

| Part | What it is | You pick it with |
| --- | --- | --- |
| **Provider** | *Where* the agent runs (your host, a container, a microVM, a cloud VM). | A provider package (`dockerSandbox`, `sbxSandbox`, `localProcessSandbox`, …) |
| **Workspace** | *What the agent sees*: the source repo, package manager, setup commands, secrets. | `defineWorkspace({ … })` |
| **Harness adapter** | *Which agent runs* and how its output is translated to chat chunks. | `grokBuildText`, `claudeCodeText`, `codexText`, `opencodeText`, or `acpCompatible` for [any ACP agent](./harnesses) |

`defineSandbox()` binds a provider + workspace (+ optional policy, lifecycle, and
hooks) into a reusable definition. `withSandbox(definition)` is the `chat()`
middleware that turns it on for a run.

### How a run executes

```txt
chat({ adapter: grokBuildText(), middleware: [withSandbox(repoSandbox)] })
  │
  ├─ withSandbox.setup    → ensure the sandbox: resume → restore snapshot → create + bootstrap
  ├─ adapter.chatStream   → spawn `grok` INSIDE the sandbox; stream its events back as AG-UI chunks
  └─ withSandbox.onFinish → snapshot / destroy per the lifecycle
```

A harness adapter declares `requires: [SandboxCapability]`, so `chat()` fails
fast at the call site if no middleware provides a sandbox, you can't
accidentally run a coding agent with nowhere to run it.

## When to use a sandbox

Reach for a sandbox whenever you want an agent to **act on a real codebase**,
not just talk about one. A few shapes this takes:

- **CI issue triage / bug-fix bots.** On a new issue, clone the repo into a
  sandbox, let the agent reproduce and root-cause it, and post the findings (or
  a draft fix) back.
- **PR review automation.** Check out a branch, run the test/lint scripts, and
  have the agent comment on what it found.
- **Build-and-preview.** Ask the agent to scaffold or modify an app, run the dev
  server inside the sandbox, and hand the user a live preview URL, see the
  [Cloudflare guide](./cloudflare) and the `examples/sandbox-*-web` apps.
- **Eval / benchmark harnesses.** Run a coding agent against a fixture repo with
  a known bug and assert on the resulting diff, reproducibly, in isolation.
- **Interactive coding copilots** that need to actually execute code, edit
  files, and run commands rather than only suggest them.

If you only need the model to read code you already have in memory, you don't
need a sandbox, a normal `chat()` with [tools](../tools/server-tools) is
enough. The sandbox earns its keep the moment the agent needs a filesystem and a
shell.

## Where to go next

[Quick Start](./quick-start) gets an agent fixing a bug in a sandbox on your laptop.
After that, pick the piece you need:

- [Providers](./providers): local process, Docker container, Docker Sandboxes
  (`sbxSandbox`), Daytona, Vercel, Sprites, and what each one can do.
- [Harnesses](./harnesses): which agent runs. Grok Build, Claude Code, Codex,
  OpenCode, or any ACP agent.
- [Workspace](./workspace): the source repo, clone depth, and setup commands.
- [Tools](./tools): bridge your app's own tools into the in-sandbox agent.
- [Policy](./policy): allow, ask or deny guardrails on what the agent may run.
- [Lifecycle & Snapshots](./lifecycle): reuse a sandbox, snapshot after setup, resume.
- [Instance Durability](./durability): reuse it across replicas too.
- [Durable Runs](./durable-runs): let a run outlive the tab, and turn it on.
- [Events](./events): stream the agent's edits and tool calls to a UI, and choose what
  to store.

The Advanced group in the sidebar has the rest: the journal file, takeover from
another host, the reaping sweeper, provisioning, observability, Cloudflare, and how to
build an adapter.

## Try it

Three runnable demos:

- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web):
  a "build me an app" agent on Docker with durable runs wired. It scaffolds an app,
  runs the dev server, and hands back a live preview URL. The run survives a refresh
  and a closed tab, and Stop is a real cancel.
- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare):
  the same idea at the edge, with the harness picked per run from the UI.
- [`examples/ts-react-chat`](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat)
  at `/sandboxes/repo-report`: clone `TanStack/ai`, pick Claude Code, Grok Build,
  or Codex, and read a typed report from `useChat().final`. See
  [Harness Agents](../structured-outputs/harnesses).
