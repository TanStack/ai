---
title: ACP-Compatible Harness
id: acp-compatible-harness
description: "Plug any ACP coding agent into a TanStack AI sandbox — no dedicated package required."
keywords:
  - tanstack ai
  - acp
  - agent client protocol
  - coding agent
  - harness
  - sandbox
  - custom adapter
---

If you need a coding agent that speaks [ACP](https://agentclientprotocol.com) but has no `@tanstack/ai-*` package → use `acpCompatible`. Prefer a dedicated harness ([Grok Build](./grok-build), etc.) when one exists.

## When do I need this?

- Agent CLI speaks ACP (`grok`, `gemini --acp`, …) and has no first-class adapter
- You already run agents inside a [sandbox](../sandbox/overview)

## Install

```bash
npm install @tanstack/ai-acp @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
```

## Do this

1. Configure the harness once with `acpCompatible({ name, command })`.
2. Select a model per call.
3. Pass `withSandbox(...)` middleware.

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

const pi = acpCompatible({
  name: 'pi',
  command: ({ model, harnessCwd }) => `pi --acp -m ${model} --cwd ${harnessCwd}`,
  authMethodId: 'pi-api-key',
  refusalMessage: 'Pi refused the request.',
})

const sandbox = defineSandbox({
  id: 'pi-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['npm install -g pi-cli'],
    secrets: createSecrets({ PI_API_KEY: process.env.PI_API_KEY ?? '' }),
  }),
})

const stream = chat({
  adapter: pi('pi-fast'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

You get sandbox resolution, `chat()`-tool → MCP bridging, session resume, permission handling, abort, and AG-UI event translation.

### One-shot (single model)

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

### Typed models and options

Declare `models` and a type-only `modelOptions` brand so calls type-check. Options merge with base ACP options and reach `command` / `openTransport` as `ctx.modelOptions`:

```ts
import { acpCompatible } from '@tanstack/ai-acp'

const pi = acpCompatible({
  name: 'pi',
  models: ['pi-fast', 'pi-pro'],
  modelOptions: {} as { reasoningEffort?: 'low' | 'high' },
  command: ({ model, harnessCwd, modelOptions }) =>
    `pi --acp -m ${model} --cwd ${harnessCwd}` +
    (modelOptions?.reasoningEffort ? ` --effort ${modelOptions.reasoningEffort}` : ''),
})

pi('pi-pro') // ok
// pi('pi-ultra') // type error
```

```ts
import { chat } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import { pi } from './pi-harness'
import { sandbox } from './sandbox'
import { messages } from './chat-context'

const stream = chat({
  adapter: pi('pi-pro'),
  modelOptions: { reasoningEffort: 'high' },
  messages,
  middleware: [withSandbox(sandbox)],
})
```

Base options always available on `modelOptions`: `sessionId`, `cwd`, `authMethodId`, `permissionMode`.

## Configuration

| Field | Purpose |
| --- | --- |
| `name` (required) | Label, log prefix, and `<name>.session-id` CUSTOM event name |
| `models` | Accepted model ids — type-safe factory args. Omit → any string |
| `modelOptions` | Type-only brand for `chat({ modelOptions })` (`{} as { … }`) |
| `command` | Build stdio launch cmd from `{ model, cwd, harnessCwd, sandbox, env, modelOptions, signal }`. Required unless `openTransport` |
| `skillsDir` | Skills dir relative to workspace (e.g. `'.pi/skills'`) for `gitSkill` links |
| `openTransport` | Custom `AcpSessionTransport` (e.g. WebSocket). Overrides `command` |
| `cwd` | Working dir in sandbox (default `/workspace`) |
| `env` | Extra env for the harness process |
| `authMethodId` | ACP auth method before session start |
| `permissionMode` | `'default'` \| `'acceptEdits'` \| `'bypassPermissions'` (default) |
| `permissions` | `'headless'` (default) or `'interactive'` |
| `onPermissionRequest` | Custom permission handler |
| `refusalMessage` | `RUN_ERROR` message on refuse |
| `planEventName` | Emit ACP `plan` as CUSTOM under this name |
| `emitDiff` | Post-run `git diff` as `file.changed` CUSTOM (off by default) |
| `onExtNotification` | Vendor `_x/…` JSON-RPC notifications |
| `buildPrompt` | Override history → harness prompt |

## WebSocket / custom transport

Some harnesses serve ACP over WebSocket. Open the transport yourself; put teardown in `dispose`:

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

Sandbox is the security boundary. Default: `'headless'` + `permissionMode: 'bypassPermissions'`. For client approvals:

```ts
import { acpCompatible } from '@tanstack/ai-acp'

const pi = acpCompatible({
  name: 'pi',
  command: ({ model }) => `pi --acp -m ${model}`,
  permissions: 'interactive',
  permissionMode: 'acceptEdits',
})
```

`chat()`-bridged tools are always auto-approved.

## Session resume

1. Capture `<name>.session-id` CUSTOM event (e.g. `pi.session-id`).
2. Pass it back as `modelOptions.sessionId`.
3. Send only the latest user message — harness holds prior context.

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import { pi } from './pi-harness'
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

## Workspace skills

| Workspace input | Projection |
| --- | --- |
| `mcpSkill(name, config)` | ACP `newSession` `mcpServers` (secrets resolved) |
| `gitSkill({ repo })` | Cloned, linked into `skillsDir` |
| `fileSkill({ path, content })` | Written into workspace root |
| `instructions` | Written to `AGENTS.md` |
| `agentSkill` / `plugins` | No ACP primitive — warned and skipped |

Workspace `secrets` inject into the agent env at create/resume (never snapshotted).

## Protocol coverage

**Covered:** `initialize`, `authenticate`, `session/new` / `load` / `prompt` / `cancel`, `session/request_permission`, streamed updates (`agent_message_chunk`, `agent_thought_chunk`, tool calls, `plan`), all five stop reasons.

**CUSTOM events:** `<name>.session-id`, `<name>.message-content` (non-text blocks), plan (if `planEventName`).

**Not implemented (by design):** `fs/*`, `terminal/*` (agent has sandbox access), multimodal prompts (text only), incremental `usage_update`, experimental ACP features.

## Next steps

- [Sandbox Overview](../sandbox/overview)
- [Grok Build Adapter](./grok-build)
- [Sandbox Tools](../sandbox/tools)
- [OpenAI-Compatible Adapter](./openai-compatible)
