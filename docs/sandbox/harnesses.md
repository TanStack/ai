---
title: Harnesses
id: sandbox-harnesses
description: "Pick which coding agent runs inside a TanStack AI sandbox: Grok Build, Claude Code, Codex, OpenCode, or any ACP-compliant agent via acpCompatible."
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

## Typed report from a harness

If you want a typed object after the agent inspects the repo, pass `outputSchema` on the same `chat()` call. See [Harness Agents](../structured-outputs/harnesses).

## Harness output can go to a journal

`grokBuildText`, `claudeCodeText`, and `codexText` can stop holding the agent's
stdout pipe: instead they redirect it to an append-only NDJSON file inside the
sandbox (`/tmp/tanstack-runs/<runId>.ndjson`) and tail that, so losing the host
cannot signal the agent and any later reader can replay the run from byte 0.

**They do that only for a durable run.** Journaling is opt-in, and the opt-in is
passing `withSandbox` **both** `runs` and `durability` (the snippet above), a
plain `withSandbox(sandbox)`, writes no journal and streams over a pipe exactly
as it always has. Pass both and forward the `runId`, whose value the journal path
is derived from (a durable run with no caller-supplied `runId` throws
`DurableRunIdRequiredError` rather than minting one nothing can recompute):

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { codexText } from '@tanstack/ai-codex'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'

// Single-process stand-ins; ./takeover has the multi-replica wiring.
const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = memoryStream(request)
  const stream = chat({
    adapter: codexText('gpt-5.3-codex'),
    messages,
    threadId,
    runId, // makes the run's journal findable again
    // BOTH stores, or there is no journal: this is the whole opt-in.
    middleware: [withSandbox(sandbox, { runs, durability: { adapter } })],
  })
  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

The id must be unique per run: the journal appends, so reusing one makes a reader
stop at the previous run's exit sentinel. Full details, including what you get
without the opt-in and replay against an already-delivered log, are in
[The Run Journal](./journal).

`opencodeText` and `acpCompatible` harnesses do not read NDJSON off stdout at
all, so they have no journal even when a run is durable.

## Any ACP agent (`acpCompatible`)

Many coding agents speak the [Agent Client Protocol](https://agentclientprotocol.com)
(ACP), `pi`, `gemini --acp`, and [dozens of others](https://agentclientprotocol.com/get-started/agents).
For any of them that doesn't have a dedicated package, `acpCompatible` (from
`@tanstack/ai-acp`) builds a harness adapter on the spot, the harness equivalent
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

- **[Providers](./providers)**: where the harness runs (local, Docker, Daytona, Vercel, Sprites).
- **[The Run Journal](./journal)**: how a run's output survives the host that started it.
- **[Takeover & Detached Runs](./takeover)**: detach on disconnect, and the three exports a harness adapter implements to support attach.
- **[Tools](./tools)**: bridge your app's own tools into the in-sandbox agent.
- **[Events & File Hooks](./events)**: stream the agent's edits and activity to a UI.
