---
id: overview
order: 1
title: Sandboxes Overview
description: "Run coding-agent CLIs (Claude Code, Codex, OpenCode) inside an isolated sandbox with a real filesystem and a cloned repo, and stream their work back through chat()."
---

A **sandbox** gives a coding agent a real computer to work in: a filesystem, a
shell, processes, and a cloned repository. You point a **harness adapter** (a
coding-agent CLI like Claude Code) at it through `chat()`, and the agent's work —
edits, commands, tool calls — streams back to you like any other chat run.

The same code runs on your laptop, in CI, in a Docker container, or on the edge.
Only the **provider** changes.

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
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
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
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

## The three moving parts

A sandboxed run is the composition of three independent pieces. You can change
any one without touching the others.

| Part | What it is | You pick it with |
| --- | --- | --- |
| **Provider** | The isolation primitive — *where* the agent runs (your host, a container, a cloud VM). | A provider package (`dockerSandbox`, `localProcessSandbox`, …) |
| **Workspace** | *What the agent sees* — the source repo, package manager, setup commands, secrets. | `defineWorkspace({ … })` |
| **Harness adapter** | *Which agent runs* and how its output is translated to chat chunks. | `claudeCodeText`, `codexText`, `opencodeText` |

`defineSandbox()` binds a provider + workspace (+ optional policy, lifecycle, and
hooks) into a reusable definition. `withSandbox(definition)` is the `chat()`
middleware that turns it on for a run.

### How a run executes

```txt
chat({ adapter: claudeCodeText(), middleware: [withSandbox(repoSandbox)] })
  │
  ├─ withSandbox.setup    → ensure the sandbox: resume → restore snapshot → create + bootstrap
  ├─ adapter.chatStream   → spawn `claude` INSIDE the sandbox; stream its events back as AG-UI chunks
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
  a draft fix) back. See `examples/sandbox-issue-triage`.
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
- **[Providers](./providers)** — local process, Docker, Daytona, Vercel: isolation, auth, and capabilities.
- **[Workspace](./workspace)** — the source repo, clone depth, and serial/parallel setup.
- **[Provisioning](./provisioning)** — secrets, skills, MCP servers, plugins, and `AGENTS.md`.
- **[Tools](./tools)** — bridge your app's own host tools into the in-sandbox agent.
- **[Policy](./policy)** — allow / ask / deny guardrails on what the agent may run.
- **[Lifecycle & Snapshots](./lifecycle)** — reuse, snapshot-after-setup, and resume.
- **[Events & File Hooks](./events)** — stream the agent's edits and activity to a UI.
- **[Cloudflare (edge)](./cloudflare)** — run the agent and a live preview at the edge.

## Try it

A runnable end-to-end demo lives at `examples/sandbox-coding-agent`: it clones a
tiny repo with a deliberate bug into a sandbox, asks Claude Code to fix it,
streams the agent's output, and prints the resulting diff. Run it with Docker or
with `SANDBOX=local` on your host (requires `ANTHROPIC_API_KEY`).

`examples/sandbox-issue-triage` goes further: it fetches the first open issue on
`TanStack/ai`, clones the repo into a sandbox, runs Claude Code to triage it, and
writes a Markdown report locally — using [file-event hooks](./events) to log the
agent's edits live.

For a **web** chat where the agent builds and runs an app inside a sandbox and
hands back a live preview URL, see `examples/sandbox-local-web` (Docker / local),
`examples/sandbox-daytona-web` (managed Daytona sandbox), and
`examples/sandbox-vercel-web` (Vercel microVM).

> **Persistence-ready:** the sandbox layer ships with in-memory stores for
> resume bookkeeping. A future persistence package can provide durable
> `SandboxStore` / `LockStore` implementations (and event-log replay) by
> supplying those optional capabilities — no changes to the sandbox layer.
