---
title: Grok Build
id: grok-build-adapter
order: 15
description: "xAI Grok Build coding agent harness — sandbox-required, via @tanstack/ai-grok-build."
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

If you need Grok Build as a coding agent → install, provide a sandbox, call `grokBuildText` with `withSandbox(...)`.

> **Requires a sandbox.** `chat()` errors without `withSandbox(...)`. Sandbox is the FS + safety boundary. See [Sandboxes](../sandbox/overview).

## Install

```bash
npm install @tanstack/ai-grok-build @tanstack/ai-sandbox
```

Also need a provider (e.g. `@tanstack/ai-sandbox-docker`) and `grok` CLI in the image.

## Auth

1. `XAI_API_KEY` as workspace secret (headless/sandbox), or
2. grok.com browser login (local)

## Do this

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
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Models

| Model id | Notes |
| --- | --- |
| `grok-build` | Short alias (browser login); maps to `grok-build-0.1` |
| `grok-build-0.1` | Full id under `XAI_API_KEY` |
| `composer-2.5` | Also runnable |

Any xAI model id works; known ids get autocomplete.

## Configuration

| Option | Description |
| --- | --- |
| `cwd` | Working dir in sandbox (default `/workspace`) |
| `grokExecutable` | CLI path (default `grok`) |
| `env` | Extra env for `grok` |
| `emitDiff` | `file.changed` CUSTOM with git diff (default `true`) |
| `extraArgs` | Extra CLI flags |

`modelOptions`: `sessionId`, `cwd`, `maxTurns`.

## Stateful sessions

1. Capture `grok-build.session-id` CUSTOM event.
2. Pass `modelOptions.sessionId`.
3. Send only the latest user message.

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

1. **Harness tools** — shell, edits, search (results attached).
2. **Your tools** — `toolDefinition().server()` + MCP bridge. See [Sandbox tools](../sandbox/tools).

No client-side / `needsApproval` tools — fails fast.

## Notes

- Always `withSandbox(...)`
- Server-only (Node)
- Harness owns agent loop; no sampling controls
- Higher cold-start latency
