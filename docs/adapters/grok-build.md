---
title: Grok Build
id: grok-build-adapter
order: 15
description: "Use xAI's Grok Build coding agent as a chat backend in TanStack AI — a sandbox harness that runs the grok CLI against a real workspace, with tool bridging via @tanstack/ai-grok-build."
keywords:
  - tanstack ai
  - grok
  - grok build
  - xai
  - harness
  - agent
  - coding agent
  - adapter
---

The Grok Build adapter runs xAI's **Grok Build** coding agent as a chat backend.
Unlike HTTP provider adapters, this is a **harness adapter**: Grok Build runs
its own agent loop and executes its own tools — shell commands, file edits,
search — by spawning the `grok` CLI **inside a sandbox**. Each `chat()` call runs
one full harness turn; the harness's tool activity streams back as
already-resolved tool-call events your UI can render.

> **Requires a sandbox.** `grok-build` declares `requires: [SandboxCapability]`,
> so `chat()` errors at the call site unless you provide a sandbox with
> `withSandbox(...)` middleware. The sandbox — your laptop, a Docker container,
> or a cloud VM — is the filesystem and safety boundary the agent runs in. See
> the [Sandboxes overview](../sandbox/overview) for the full picture.

## Installation

```bash
npm install @tanstack/ai-grok-build @tanstack/ai-sandbox
```

You also need a sandbox provider (e.g. `@tanstack/ai-sandbox-docker`) and the
`grok` CLI available inside the sandbox image.

## Authentication

Your laptop can already have `grok login`. A CI runner only has `XAI_API_KEY`.
Both can use the same sandbox provider. Set `authMode` so the adapter knows
which credentials to use. See [Harness Auth](../sandbox/auth).

```ts
grokBuildText("composer-2.5", { authMode: "host" })
grokBuildText("composer-2.5", { authMode: "api-key" })
```

- `'host'`: skip ACP `authenticate`. Use `grok login`. Do not inject
  `XAI_API_KEY` into that process.
- `'api-key'`: inject `XAI_API_KEY` and authenticate with it.

The two modes list the model under slightly different ids. The adapter maps
the short alias for you (see [Models](#models)).

## Basic Usage

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

const sandbox = defineSandbox({
  id: 'grok-build-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
    secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
  }),
})

const stream = chat({
  threadId,
  adapter: grokBuildText('composer-2.5', { authMode: 'api-key' }),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Models

Grok Build accepts any xAI model id its backend supports; the known ids get
autocomplete (any string is allowed):

| Model id | Notes |
| --- | --- |
| `grok-build` | The short alias. With a grok.com browser login the CLI lists it under this name. |
| `grok-build-0.1` | The fully-qualified id the CLI lists when authenticated with `XAI_API_KEY`. |
| `composer-2.5` | Also runnable through the Grok Build harness. |

Pass any of these to `grokBuildText(...)` — the adapter resolves `grok-build` to
the CLI's `grok-build-0.1` automatically, so the same code works under both auth
modes.

## Configuration

Adapter config (second argument to `grokBuildText`):

| Option           | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `cwd`            | Working directory inside the sandbox. Defaults to `/workspace`.             |
| `grokExecutable` | Path/name of the `grok` executable inside the sandbox. Defaults to `grok`.  |
| `env`            | Extra environment variables for the `grok` process inside the sandbox.      |
| `emitDiff`       | Emit a `file.changed` CUSTOM event with the working-tree `git diff` after the run. Defaults to `true`. |
| `protocol`       | Harness wire protocol: `'acp'` or `'streaming-json'`. Defaults to `'acp'`. A durable sandbox run with no protocol set uses `'streaming-json'` so the run can journal. |
| `authMode`       | `'host'` uses `grok login`. `'api-key'` uses `XAI_API_KEY`. See [Harness Auth](../sandbox/auth). |
| `authMethodId`   | Explicit ACP auth method. Wins over `authMode`.                             |
| `extraArgs`      | Extra raw CLI flags appended verbatim (advanced).                           |

Per-call overrides go through `modelOptions`:

| `modelOptions`  | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `sessionId`     | Resume an existing Grok Build session (see below).           |
| `cwd`           | Per-call override of the harness working directory.          |
| `maxTurns`      | Per-call cap on the number of harness turns.                 |
| `protocol`      | Per-call override of the harness wire protocol.              |
| `authMode`      | Per-call `'host'` or `'api-key'`.                            |
| `authMethodId`  | Per-call ACP auth method. Wins over `authMode`.              |

## Stateful Sessions

Grok Build sessions are stateful — the harness keeps the working context (files
read, commands run, conclusions reached) between turns. The adapter surfaces the
session id of every fresh run as a custom stream event named
`grok-build.session-id`; thread it back via `modelOptions.sessionId` to resume.
When resuming, only the latest user message is sent — the harness already holds
the prior context.

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const sessionId =
    typeof params.forwardedProps.sessionId === 'string'
      ? params.forwardedProps.sessionId
      : undefined

  const stream = chat({
    adapter: grokBuildText('grok-build'),
    messages: params.messages,
    middleware: [withSandbox(sandbox)],
    modelOptions: { sessionId },
  })

  return toServerSentEventsResponse(stream)
}
```

## Tools

Two kinds of tools flow through this adapter:

1. **Built-in harness tools** are executed by Grok Build itself (shell, file
   edits, search) and stream back as tool-call events with results already
   attached. Your code never executes them.
2. **Your TanStack tools** are bridged *into* the harness over an authenticated
   MCP tool-proxy: define them with `toolDefinition().server()` and pass them to
   `chat({ tools })`. Tool-call events come back under the names you registered.
   Because the harness runs in a sandbox, see [Sandbox tools](../sandbox/tools)
   for how the bridge reaches your host across providers (local/Docker vs cloud).

**Client-side and approval-gated tools are not supported** — the harness runs
tools inside a live process and can't pause across an HTTP round-trip. A tool
without a server `execute()` (or marked `needsApproval`) fails fast; run those
with a regular provider adapter.

## Durable runs

A durable sandbox run (you pass `runs` and `durability` to `withSandbox`)
journals the agent output so a later request can take the run over. ACP does
not journal. When durability is wired and you do not set `protocol`, the
adapter uses `'streaming-json'`.

Set `protocol: 'acp'` only when you want ACP on that call. A fresh ACP run
with durability wired logs a warning. An attach against ACP throws
`DurableAttachNotSupportedError`.

## Headless NDJSON flags

On the `'streaming-json'` path with auto-approve, the adapter adds
`--always-approve --no-plan --no-auto-update`. Those flags keep Plan Mode and
the CLI update check from blocking a headless run.

## Structured Output

Pass `outputSchema` on `chat()`. Grok Build has no native schema flag. The adapter adds the JSON Schema to the prompt (ACP and `streaming-json`) and parses the last assistant text. Tool activity still streams. The object arrives as `structured-output.complete`.

```ts
import { chat } from "@tanstack/ai"
import { grokBuildText } from "@tanstack/ai-grok-build"
import { defineSandbox, withSandbox } from "@tanstack/ai-sandbox"
import { dockerSandbox } from "@tanstack/ai-sandbox-docker"
import { z } from "zod"

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
})

const sandbox = defineSandbox({
  id: "repo-report",
  provider: dockerSandbox({ image: "node:22" }),
})

const report = await chat({
  adapter: grokBuildText("grok-build"),
  messages: [{ role: "user", content: "Review this repo." }],
  outputSchema: Report,
  middleware: [withSandbox(sandbox)],
})

report.summary
```

This path parses JSON from the last assistant message. If extract-only is the job, use `@tanstack/ai-grok`.

On the client, pass the same schema to `useChat` and read `final`. `partial` stays empty until the end.

```tsx
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { z } from "zod"

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
})

function ReportView() {
  const { final, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/repo-report"),
    outputSchema: Report,
  })

  if (isLoading) return <p>The agent is inspecting the repo.</p>
  if (!final) return null
  return <p>{final.summary}</p>
}
```

Full walkthrough, including the client: [Harness Agents](../structured-outputs/harnesses).

## Limitations

- **Requires a sandbox.** Always run it under `withSandbox(...)`; see the
  [Sandboxes overview](../sandbox/overview).
- **Server-only (Node).** The harness spawns the `grok` CLI in a sandbox.
- **The harness owns the agent loop.** TanStack's agent-loop strategies and
  per-iteration middleware don't apply inside a harness turn.
- **No sampling controls.** `temperature`-style options don't exist here.
- **Cold starts.** Each call runs a full harness turn; expect higher first-token
  latency than HTTP adapters.
