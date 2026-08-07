---
title: Harnesses
id: sandbox-harnesses
description: "Pick which coding agent runs in a sandbox: Grok Build, Claude Code, Codex, OpenCode, or any ACP agent."
---

If you need to change **which** agent runs without touching provider/workspace → swap the harness adapter.

Harness = agent + translation of its work into `chat()` stream chunks. Provider = where it runs. Both use the same `chat()` + `withSandbox()` wiring.

Every harness declares `requires: [SandboxCapability]` → `chat()` fails fast without `withSandbox(...)`.

## Built-in adapters

| Harness | Package | Adapter | Auth env |
| --- | --- | --- | --- |
| [Grok Build](../adapters/grok-build) | `@tanstack/ai-grok-build` | `grokBuildText` | `XAI_API_KEY` (or grok.com on local-process) |
| [Claude Code](../adapters/claude-code) | `@tanstack/ai-claude-code` | `claudeCodeText` | `ANTHROPIC_API_KEY` (or `claude login`) |
| [Codex](../adapters/codex) | `@tanstack/ai-codex` | `codexText` | `CODEX_API_KEY` or `OPENAI_API_KEY` |
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

## Journal (durable runs only)

`grokBuildText`, `claudeCodeText`, and `codexText` redirect stdout to `/tmp/tanstack-runs/<runId>.ndjson` **only when** `withSandbox` gets **both** `runs` and `durability`. Plain `withSandbox(sandbox)` → no journal, pipe stream as before.

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

const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = memoryStream(request)
  const stream = chat({
    adapter: codexText('gpt-5.3-codex'),
    messages,
    threadId,
    runId, // journal path derived from this; durable run without it throws DurableRunIdRequiredError
    middleware: [withSandbox(sandbox, { runs, durability: { adapter } })],
  })
  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

**Cause → fix:** reuse a `runId` → append after previous exit sentinel → reader stops early. Use a unique id per run.

Full details → [The Run Journal](./journal). Multi-replica wiring → [Takeover](./takeover).

`opencodeText` and `acpCompatible` do not journal.

## Any ACP agent (`acpCompatible`)

For agents without a dedicated package that speak [ACP](https://agentclientprotocol.com):

```ts
import { acpCompatible } from '@tanstack/ai-acp'

const pi = acpCompatible({
  name: 'pi',
  models: ['pi-fast', 'pi-pro'],
  command: ({ model, harnessCwd }) => `pi --acp -m ${model} --cwd ${harnessCwd}`,
  authMethodId: 'pi-api-key',
})
```

Full config → [ACP-Compatible Harness](../adapters/acp-compatible). Agent lists: [ACP agents](https://agentclientprotocol.com/get-started/agents) · [registry](https://agentclientprotocol.com/get-started/registry).

## Next

- [Providers](./providers) · [Journal](./journal) · [Takeover](./takeover)
- [Tools](./tools) · [Events](./events)
