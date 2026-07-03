---
id: overview
order: 1
title: Sandboxes Overview
description: "Run coding-agent CLIs (Grok Build, Claude Code, Codex, OpenCode) inside an isolated sandbox with a real filesystem and a cloned repo, and stream their work back through chat()."
---

A **sandbox** gives a coding agent a real computer to work in: a filesystem, a
shell, processes, and a cloned repository. You point a **harness adapter** (a
coding-agent CLI like Grok Build) at it through `chat()`, and the agent's work —
edits, commands, tool calls — streams back to you like any other chat run.

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

## The three moving parts

A sandboxed run is the composition of three independent pieces. You can change
any one without touching the others.

| Part | What it is | You pick it with |
| --- | --- | --- |
| **Provider** | The isolation primitive — *where* the agent runs (your host, a container, a cloud VM). | A provider package (`dockerSandbox`, `localProcessSandbox`, …) |
| **Workspace** | *What the agent sees* — the source repo, package manager, setup commands, secrets. | `defineWorkspace({ … })` |
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
fast at the call site if no middleware provides a sandbox — you can't
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
  server inside the sandbox, and hand the user a live preview URL — see the
  [Cloudflare guide](./cloudflare) and the `examples/sandbox-*-web` apps.
- **Eval / benchmark harnesses.** Run a coding agent against a fixture repo with
  a known bug and assert on the resulting diff — reproducibly, in isolation.
- **Interactive coding copilots** that need to actually execute code, edit
  files, and run commands rather than only suggest them.

If you only need the model to read code you already have in memory, you don't
need a sandbox — a normal `chat()` with [tools](../tools/server-tools) is
enough. The sandbox earns its keep the moment the agent needs a filesystem and a
shell.

## Where to go next

Start with the [Quick Start](./quick-start) to get an agent fixing a bug in a
sandbox on your laptop. Then dive into the piece you need:

- **[Quick Start](./quick-start)** — from a `chat()` app to an agent fixing a bug, in minutes.
- **[Providers](./providers)** — local process, Docker, Daytona, Vercel, Sprites: isolation, auth, and capabilities.
- **[Harnesses](./harnesses)** — which agent runs: Grok Build, Claude Code, Codex, OpenCode, or any ACP agent via `acpCompatible`.
- **[Workspace](./workspace)** — the source repo, clone depth, and serial/parallel setup.
- **[Provisioning](./provisioning)** — secrets, skills, MCP servers, plugins, and `AGENTS.md`.
- **[Tools](./tools)** — bridge your app's own host tools into the in-sandbox agent.
- **[Policy](./policy)** — allow / ask / deny guardrails on what the agent may run.
- **[Lifecycle & Snapshots](./lifecycle)** — reuse, snapshot-after-setup, and resume.
- **[Events & File Hooks](./events)** — stream the agent's edits and activity to a UI.
- **[Cloudflare (edge)](./cloudflare)** — run the agent and a live preview at the edge.
- **[Sandbox Runs](../persistence/sandbox-runs)** — persist sandbox run records,
  resume bookkeeping, and locks across processes.

## Try it

A runnable end-to-end demo lives at
[`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web):
a "build me an app" agent you can point at any harness (Claude Code, Codex,
OpenCode, Grok Build) and any provider (Docker, local-process, Vercel, Daytona)
per run from the UI — it scaffolds an app inside the sandbox, runs the dev server,
and hands back a live preview URL, streaming the agent's output and the resulting
diff. For a coding agent running at the edge, see
[`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare).

For a **web** chat where the agent builds and runs an app inside a sandbox and
hands back a live preview URL, see `examples/sandbox-web` — one app with harness
(Claude Code / Codex / OpenCode / Grok) and provider (Docker / local / Vercel /
Daytona) pickers.

> **Durable sandbox runs:** the sandbox layer ships with in-memory stores for
> local resume bookkeeping. Use
> [Sandbox Runs](../persistence/sandbox-runs) when resume records, locks, and
> event-log replay need to survive process restarts or run across multiple
> workers.
