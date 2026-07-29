---
title: Harnesses
id: sandbox-harnesses
description: "Pick which coding agent runs inside a TanStack AI sandbox — Grok Build, Claude Code, Codex, OpenCode, or any ACP-compliant agent via acpCompatible."
---

A **harness adapter** is the second axis of a sandboxed run: it decides _which
coding agent runs_ and translates that agent's work back into `chat()` stream
chunks. The [provider](./providers) decides _where_ the agent runs; the harness
decides _what_ runs. Both sit behind the same `chat()` + `withSandbox()` wiring,
so you can swap a harness without touching your provider or [workspace](./workspace).

Every harness adapter declares `requires: [SandboxCapability]`, so `chat()` fails
fast at the call site unless a sandbox is provided via `withSandbox(...)`.

## Built-in harness adapters

Each agent has its own package with curated per-model metadata. Pass the adapter
to `chat({ adapter })` and run it under any provider.

| Harness | Package | Adapter | Auth env |
| --- | --- | --- | --- |
| [Grok Build](../adapters/grok-build) | `@tanstack/ai-grok-build` | `grokBuildText` | `XAI_API_KEY` (or grok.com login on local-process) |
| [Claude Code](../adapters/claude-code) | `@tanstack/ai-claude-code` | `claudeCodeText` | `ANTHROPIC_API_KEY` (or `claude login`) |
| [Codex](../adapters/codex) | `@tanstack/ai-codex` | `codexText` | `CODEX_API_KEY` (or `OPENAI_API_KEY`) |
| [OpenCode](../adapters/opencode) | `@tanstack/ai-opencode` | `opencodeText` | `OPENAI_API_KEY` (model-dependent) |

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'
import { messages } from './chat-context'

const stream = chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Harness output goes to a journal

`grokBuildText`, `claudeCodeText`, and `codexText` do not hold the agent's stdout
pipe. They redirect it to an append-only NDJSON file inside the sandbox
(`/tmp/tanstack-runs/<runId>.ndjson`) and tail that instead, so losing the host
cannot signal the agent and any later reader can replay the run from byte 0.

That path is derived from `runId` alone, and each adapter falls back to a random
internal id when the caller supplies none. So pass one through:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { codexText } from '@tanstack/ai-codex'
import { withSandbox } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: codexText('gpt-5.3-codex'),
    messages,
    threadId,
    runId, // makes the run's journal findable again
    middleware: [withSandbox(sandbox)],
  })
  return toServerSentEventsResponse(stream)
}
```

The id must be unique per run: the journal appends, so reusing one makes a reader
stop at the previous run's exit sentinel. Full details, including replay against
an already-delivered log, are in [The Run Journal](./journal).

`opencodeText` and `acpCompatible` harnesses do not read NDJSON off stdout at
all, so they have no journal.

## Any ACP agent (`acpCompatible`)

Many coding agents speak the [Agent Client Protocol](https://agentclientprotocol.com)
(ACP) — `pi`, `gemini --acp`, and [dozens of others](https://agentclientprotocol.com/get-started/agents).
For any of them that doesn't have a dedicated package, `acpCompatible` (from
`@tanstack/ai-acp`) builds a harness adapter on the spot — the harness equivalent
of `openaiCompatible`. Configure how to launch it once, then run it under any
provider like the built-in adapters:

```ts
import { acpCompatible } from '@tanstack/ai-acp'

const pi = acpCompatible({
  name: 'pi',
  models: ['pi-fast', 'pi-pro'],
  command: ({ model, harnessCwd }) => `pi --acp -m ${model} --cwd ${harnessCwd}`,
  authMethodId: 'pi-api-key',
})
```

See the [ACP-Compatible Harness](../adapters/acp-compatible) guide for the full
config (typed models, per-call `modelOptions`, WebSocket transports, permissions,
and protocol coverage). For which agents you can plug in, browse the official
**[ACP agents list](https://agentclientprotocol.com/get-started/agents)** and the
**[ACP registry](https://agentclientprotocol.com/get-started/registry)**.

## Where to go next

- **[Providers](./providers)** — where the harness runs (local, Docker, Daytona, Vercel, Sprites).
- **[The Run Journal](./journal)**: how a run's output survives the host that started it.
- **[Takeover & Detached Runs](./takeover)**: detach on disconnect, and the three exports a harness adapter implements to support attach.
- **[Tools](./tools)** — bridge your app's own tools into the in-sandbox agent.
- **[Events & File Hooks](./events)** — stream the agent's edits and activity to a UI.
