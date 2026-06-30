---
title: ACP-Compatible Harness
id: acp-compatible-harness
description: "Plug any Agent Client Protocol (ACP) coding agent into a TanStack AI sandbox with one generic harness adapter — no dedicated package required."
keywords:
  - tanstack ai
  - acp
  - agent client protocol
  - coding agent
  - harness
  - sandbox
  - custom adapter
---

Coding-agent CLIs that speak the [Agent Client Protocol](https://agentclientprotocol.com) (ACP) — `grok`, `gemini --acp`, and others — expose a long-lived JSON-RPC session you can drive from a sandbox. Instead of a dedicated package per agent, `acpCompatible` builds a `chat()` adapter for **any** ACP-compliant CLI: configure how to launch it once, select a model per call, and pass it into a sandbox.

It is the harness equivalent of the [OpenAI-Compatible adapter](./openai-compatible). Use it when your agent speaks ACP but has no `@tanstack/ai-*` package. If a dedicated harness adapter exists ([Grok Build](./grok-build), and others), prefer it — those carry curated per-model metadata and vendor-specific behavior.

## Installation

`acpCompatible` ships in `@tanstack/ai-acp`. You drive it inside a sandbox, so install the sandbox package and a provider too:

```bash
npm install @tanstack/ai-acp @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
```

## Basic Usage

Configure the harness once with `acpCompatible({ name, command })`, then select a model per call. `command` builds the shell command that launches the agent's ACP server over **stdio** inside the sandbox:

```ts
import { chat } from '@tanstack/ai'
import { acpCompatible } from '@tanstack/ai-acp'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { messages } from './chat-context'

// Configure the "pi" agent harness once:
const pi = acpCompatible({
  name: 'pi',
  command: ({ model, harnessCwd }) => `pi --acp -m ${model} --cwd ${harnessCwd}`,
  authMethodId: 'pi-api-key', // when the harness advertises an ACP auth method
  refusalMessage: 'Pi refused the request.',
})

const sandbox = defineSandbox({
  id: 'pi-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['npm install -g pi-cli'], // install the agent CLI into the image
    secrets: createSecrets({ PI_API_KEY: process.env.PI_API_KEY ?? '' }),
  }),
})

const stream = chat({
  adapter: pi('pi-fast'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

You get the full ACP flow for free: sandbox resolution, `chat()`-tool → MCP bridging, session resume, permission handling, abort, and AG-UI event translation.

## One-Shot Usage

For a single model, skip the harness-factory and build the adapter inline with `acpCompatibleText`:

```ts
import { chat } from '@tanstack/ai'
import { acpCompatibleText } from '@tanstack/ai-acp'
import { withSandbox } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'
import { messages } from './chat-context'

const stream = chat({
  adapter: acpCompatibleText('pi-fast', {
    name: 'pi',
    command: ({ model }) => `pi --acp -m ${model}`,
  }),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Configuration

| Field | Purpose |
| --- | --- |
| `name` (required) | Harness label, log prefix, and the `<name>.session-id` CUSTOM event name. |
| `command` | Build the **stdio** launch command from `{ model, cwd, harnessCwd, sandbox, env, signal }`. Required unless `openTransport` is given. |
| `openTransport` | Open any `AcpSessionTransport` yourself (e.g. boot a `serve` process and connect over WebSocket). Overrides `command`. |
| `cwd` | Working directory inside the sandbox (default `/workspace`). |
| `env` | Extra environment variables for the harness process. |
| `authMethodId` | ACP auth method to select before the session starts. |
| `permissionMode` | `'default'` \| `'acceptEdits'` \| `'bypassPermissions'` (default). |
| `permissions` | `'headless'` (auto-resolve, default) or `'interactive'` (emit approval-requested events for `ask` prompts). |
| `onPermissionRequest` | Custom permission handler; overrides `permissions`/`permissionMode`. |
| `refusalMessage` | `RUN_ERROR` message when the harness refuses a request. |
| `planEventName` | Emit ACP `plan` updates as a CUSTOM event under this name. |
| `emitDiff` | Emit the post-run `git diff` of `cwd` as a `file.changed` CUSTOM event (off by default). |
| `onExtNotification` | Handle vendor `_x/…` JSON-RPC notifications. |
| `buildPrompt` | Override how chat history maps to the harness prompt. |

## WebSocket and Custom Transports

Some harnesses run an ACP server you reach over WebSocket rather than stdio (the `grok agent serve` pattern). Open the transport yourself with `openTransport` — it receives the same context and returns an `AcpSessionTransport`. Put all teardown in the returned transport's `dispose`:

```ts
import { acpCompatible, startAcpServerInSandbox } from '@tanstack/ai-acp'

const myAgent = acpCompatible({
  name: 'my-agent',
  openTransport: async ({ sandbox, model, harnessCwd, signal }) => {
    const server = await startAcpServerInSandbox(sandbox, {
      port: 9100,
      cwd: harnessCwd,
      command: `my-agent serve --bind 0.0.0.0:9100 -m ${model}`,
      readyMarker: 'listening',
      buildWsUrl: ({ channel, port }) =>
        `${channel.url.replace(/^http/i, 'ws')}:${port}`,
      ...(signal ? { signal } : {}),
    })
    const ws = await server.connect(signal)
    return {
      kind: 'stream',
      stream: ws.stream,
      dispose: async () => {
        ws.close()
        await server.dispose()
      },
    }
  },
})
```

## Permissions

Inside a sandbox the sandbox itself is the security boundary, so the default `'headless'` strategy with `permissionMode: 'bypassPermissions'` lets the agent edit files and run commands without prompting. To surface tool approvals to a client instead, switch to `'interactive'`:

```ts
import { acpCompatible } from '@tanstack/ai-acp'

const pi = acpCompatible({
  name: 'pi',
  command: ({ model }) => `pi --acp -m ${model}`,
  permissions: 'interactive', // emit approval-requested events for `ask` prompts
  permissionMode: 'acceptEdits', // still auto-approve file edits
})
```

`chat()`-provided tools bridged into the agent are always auto-approved, regardless of mode.

## Session Resume

On every run the adapter emits the harness session id as a CUSTOM event named `<name>.session-id` (e.g. `pi.session-id`). Thread that id back through `modelOptions.sessionId` on the next call and the harness resumes the session — only the trailing user message is sent, since the agent already holds the prior context:

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import { pi } from './pi-harness' // the configured `acpCompatible(...)` factory
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const sessionId =
    typeof params.forwardedProps.sessionId === 'string'
      ? params.forwardedProps.sessionId
      : undefined

  const stream = chat({
    adapter: pi('pi-fast'),
    messages: params.messages,
    middleware: [withSandbox(sandbox)],
    modelOptions: { sessionId },
  })

  return toServerSentEventsResponse(stream)
}
```

## Next Steps

- [Sandbox Overview](../sandbox/overview) — how harnesses run inside a sandbox
- [Grok Build Adapter](./grok-build) — a first-class ACP harness adapter
- [Sandbox Tools](../sandbox/tools) — bridge your app's tools into the agent
- [OpenAI-Compatible Adapter](./openai-compatible) — the same idea for model providers
