---
id: overview
order: 1
title: Sandboxes Overview
description: "Run a coding agent (Grok Build, Claude Code, Codex, OpenCode) inside an isolated sandbox with a real filesystem and a cloned repo, and stream its work back through chat()."
---

A sandbox gives the agent a filesystem and a shell. `chat()` alone can only talk about code.

A sandbox gives the agent a real computer to work in: a cloned repo, a shell, and processes. The agent runs inside it, and its edits, commands, and tool calls stream back to you like any other `chat()` run.

## Try it

This runs a Grok Build agent in a Docker container. You need Docker running and an `XAI_API_KEY`.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

2. Save this as `agent.mts`:

```ts
import { chat } from '@tanstack/ai'
import { GROK_CLI_INSTALL_COMMAND, grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'TanStack/ai' }),
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
})

const stream = chat({
  threadId: 'overview-demo',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'List the packages in this repo.' }],
  middleware: [withSandbox(repoSandbox)],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta)
}
```

3. Run it with `npx tsx agent.mts`.

The agent clones the repo into a container, reads it, and streams its answer to your terminal. Your host filesystem stays untouched.

For a full walkthrough that fixes a bug and prints the diff, go to [Quick Start](./quick-start).

## How it works

A sandboxed run has three parts. You can change one without changing the others.

| Part | What it decides | You pick it with |
| --- | --- | --- |
| **Provider** | Where the agent runs: your host, a container, a microVM, or a cloud VM. | A provider such as `dockerSandbox`, `sbxSandbox`, or `localProcessSandbox`. See [Providers](./providers). |
| **Workspace** | What the agent sees: the repo, the package manager, the setup commands, and the secrets. | `defineWorkspace({ ... })`. See [Workspace](./workspace). |
| **Harness adapter** | Which agent runs, and how its output turns into chat chunks. | `grokBuildText`, `claudeCodeText`, `codexText`, `opencodeText`, or `acpCompatible`. See [Harnesses](./harnesses). |

`defineSandbox()` binds a provider and a workspace into one reusable definition. You can also add a policy, a lifecycle, and hooks. `withSandbox(definition)` is the `chat()` middleware that turns the sandbox on for a run.

A run goes through three steps:

```txt
chat({ adapter: grokBuildText(), middleware: [withSandbox(repoSandbox)] })
  |
  |- withSandbox.setup     get a sandbox: resume it, or restore a snapshot, or create and bootstrap
  |- adapter.chatStream    start `grok` INSIDE the sandbox, stream its events back as AG-UI chunks
  '- withSandbox.onFinish  snapshot or destroy, as the lifecycle says
```

Every harness adapter declares `requires: [SandboxCapability]`. If no middleware gives it a sandbox, `chat()` fails at the call site. A coding agent never runs without a place to run.

The provider decides where the agent runs, not how it signs in. The default `authMode` is `'api-key'`. Set `'host'` when the machine already has a CLI login. See [Harness Auth](./auth).

## When to use a sandbox

Use a sandbox when the agent must act on a real codebase:

- **Issue triage and bug-fix bots.** Clone the repo, reproduce the bug, find the cause, and post the findings or a draft fix.
- **PR review.** Check out a branch, run the test and lint scripts, and comment on the results.
- **Build and preview.** Let the agent scaffold or change an app, start the dev server, and give the user a live preview URL. See [Cloudflare](./cloudflare) and the `examples/sandbox-*` apps.
- **Evals and benchmarks.** Run an agent against a fixture repo with a known bug, then make sure the diff is correct.
- **Coding copilots** that must run code, edit files, and run commands.

If the model only needs to read code that you already have in memory, you do not need a sandbox. A normal `chat()` with [tools](../tools/server-tools) is enough.

## Pick the next piece

Start here:

- [Quick Start](./quick-start): fix a bug in a sandbox on your laptop.
- [Providers](./providers): pick where the agent runs.
- [Harnesses](./harnesses): pick which agent runs.
- [Harness Auth](./auth): host CLI login or an API key.
- [Workspace](./workspace): the repo, the clone depth, and the setup commands.

Add these when you need them:

- [Tools](./tools): give the agent your own app tools.
- [Policy](./policy): allow, ask, or deny what the agent runs.
- [Lifecycle & Snapshots](./lifecycle): reuse a sandbox and skip setup on the next run.
- [Events](./events): stream file edits and tool calls to a UI.

For production:

- [Portable Snapshots](./portable-snapshots): keep the finished files after the sandbox is gone. Start with [Keep Files After Reload](./portable-snapshots-configure).
- [Instance Durability](./durability): find the same sandbox from a different server.
- [Durable Runs](./durable-runs): let a run continue after the user closes the tab.

The **Sandboxes (Advanced)** group in the sidebar has the rest: the run journal, takeover, reaping, provisioning, observability, Cloudflare, and the provider details.

## Example apps

- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web): a "build me an app" agent on Docker with durable runs. It scaffolds an app, starts the dev server, and gives back a live preview URL. The run continues after a refresh or a closed tab, and Stop cancels the agent.
- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare): the same idea at the edge. You pick the harness for each run in the UI.
- [`examples/ts-react-chat`](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat) at `/repo-report`: clone `TanStack/ai`, pick the harness and the auth mode (`host` or `api-key`), and read a typed report from `useChat().final`. See [Harness Agents](../structured-outputs/harnesses).
