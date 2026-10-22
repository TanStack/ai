---
title: Harnesses
id: sandbox-harnesses
description: "Pick which coding agent runs inside a TanStack AI sandbox: Grok Build, Claude Code, Codex, OpenCode, or any ACP-compatible agent through acpCompatible."
---

A harness is the agent inside the sandbox. Pick Grok Build, Claude Code, Codex, OpenCode, or another CLI.

A harness adapter starts that agent inside the sandbox and turns its work into `chat()` stream chunks. The [provider](./providers) decides where the agent runs. The harness decides which agent runs. You can change one without changing the other.

## Pick a harness

1. Pick a row and install its package.

| Harness | Package | Adapter | Auth |
| --- | --- | --- | --- |
| [Grok Build](../adapters/grok-build) | `@tanstack/ai-grok-build` | `grokBuildText` | Default `'api-key'` (`XAI_API_KEY`). `'host'` uses `grok login`. |
| [Claude Code](../adapters/claude-code) | `@tanstack/ai-claude-code` | `claudeCodeText` | Default `'api-key'` (`ANTHROPIC_API_KEY`). `'host'` uses `claude login`. |
| [Codex](../adapters/codex) | `@tanstack/ai-codex` | `codexText` | Default `'api-key'` (`CODEX_API_KEY`). `'host'` uses `codex login`. |
| [OpenCode](../adapters/opencode) | `@tanstack/ai-opencode` | `opencodeText` | `OPENAI_API_KEY` from the process env. No `authMode` flag. |
| [ACP-Compatible](../adapters/acp-compatible) | `@tanstack/ai-acp` | `acpCompatible` / `acpCompatibleText` | Default `'api-key'` uses `authMethodId`. `'host'` skips ACP `authenticate`. |

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-claude-code
vue: @tanstack/ai-claude-code
solid: @tanstack/ai-claude-code
svelte: @tanstack/ai-claude-code
preact: @tanstack/ai-claude-code
angular: @tanstack/ai-claude-code
vanilla: @tanstack/ai-claude-code
octane: @tanstack/ai-claude-code

<!-- ::end:tabs -->

2. Pass the adapter to `chat()`, next to `withSandbox`:

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

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [
      'npm install -g @anthropic-ai/claude-code --include=optional && claude --version',
    ],
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
})

const stream = chat({
  adapter: claudeCodeText('claude-opus-4-8'),
  messages: [{ role: 'user', content: 'Summarize this repo.' }],
  threadId: 'thread-1',
  middleware: [withSandbox(sandbox)],
})
```

The agent CLI must exist inside the sandbox. The `setup` step installs it. See [Installing an agent CLI](./workspace#installing-an-agent-cli).

To change the agent, change the adapter, the secret, and the install step. The provider and the workspace source stay the same.

## How it works

- Every harness adapter declares `requires: [SandboxCapability]`. If no `withSandbox(...)` gives it a sandbox, `chat()` fails at the call site.
- The adapter starts the agent CLI inside the sandbox and translates its output into AG-UI chunks.
- The provider does not pick how the agent signs in. The default `authMode` is `'api-key'`. Set `'host'` when the machine already has a CLI login. See [Harness Auth](./auth).

## Get a typed report

If you want a typed object after the agent reads the repo, pass `outputSchema` on the same `chat()` call. The dedicated adapters and `acpCompatible` support it. See [Harness Agents](../structured-outputs/harnesses).

## Any ACP agent (`acpCompatible`)

Many coding agents speak the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), for example `pi` and `gemini --acp`. See [the full list](https://agentclientprotocol.com/get-started/agents).

If an agent has no dedicated package, `acpCompatible` from `@tanstack/ai-acp` builds a harness adapter for it. It is the harness version of `openaiCompatible`. Tell it how to start the agent, then use it with any provider:

```ts
import { acpCompatible } from '@tanstack/ai-acp'

const pi = acpCompatible({
  name: 'pi',
  models: ['pi-fast', 'pi-pro'],
  command: ({ model, harnessCwd }) => `pi --acp -m ${model} --cwd ${harnessCwd}`,
  authMethodId: 'pi-api-key',
})
```

The [ACP-Compatible Harness](../adapters/acp-compatible) guide has the full config: typed models, `modelOptions` for each call, WebSocket transports, permissions, and protocol coverage. To find agents, see the [ACP agents list](https://agentclientprotocol.com/get-started/agents) and the [ACP registry](https://agentclientprotocol.com/get-started/registry).

## Advanced

### Harness output can go to a journal

`grokBuildText`, `claudeCodeText`, and `codexText` can write the agent's stdout to an append-only NDJSON file inside the sandbox (`/tmp/tanstack-runs/<runId>.ndjson`). The host then reads that file and does not hold the stdout pipe. As a result:

- If the host dies, the agent gets no signal and keeps working.
- A later reader can replay the run from byte 0.

They do this only for a **durable run**. To opt in, pass `withSandbox` both `runs` and `durability`. A plain `withSandbox(sandbox)` writes no journal and streams over a pipe.

You must also pass the `runId`, because the journal path comes from it. A durable run with no `runId` from the caller throws `DurableRunIdRequiredError`.

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

// Single-process stand-ins. ./takeover has the multi-replica setup.
const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = memoryStream(request)
  const stream = chat({
    adapter: codexText('gpt-5.3-codex'),
    messages,
    threadId,
    runId, // a later reader finds the journal with this id
    // Pass BOTH, or there is no journal.
    middleware: [withSandbox(sandbox, { runs, durability: { adapter } })],
  })
  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

The id must be unique for each run. The journal appends, so if you use an id again, a reader stops at the exit line of the earlier run. For what you get without the opt-in, and for replay against a log that was already delivered, see [The Run Journal](./journal).

`opencodeText` and `acpCompatible` harnesses do not read NDJSON from stdout. They have no journal, also when a run is durable.

For the rest of the durable setup, see [Durable Runs](./durable-runs) and [Takeover & Detached Runs](./takeover). Takeover also lists the three exports that a harness adapter implements to support attach.
