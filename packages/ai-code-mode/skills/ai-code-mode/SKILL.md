---
name: ai-code-mode
description: >
  LLM-generated TypeScript execution in sandboxed environments:
  createCodeModeTool() with isolate drivers (createNodeIsolateDriver,
  createQuickJSIsolateDriver, createCloudflareIsolateDriver),
  codeModeWithSkills() for persistent skill libraries, trust strategies,
  skill storage (FileSystem, LocalStorage, InMemory, Mongo), client-side
  execution progress via code_mode:* custom events in useChat.
type: core
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/code-mode/code-mode.md'
  - 'TanStack/ai:docs/code-mode/code-mode-isolates.md'
  - 'TanStack/ai:docs/code-mode/code-mode-with-skills.md'
  - 'TanStack/ai:docs/code-mode/client-integration.md'
---

> **Note**: This skill requires familiarity with ai-core and ai-core/chat-experience. Code Mode is always used on top of a chat experience.

## Setup

Complete Code Mode setup with Node.js isolate driver:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createCodeModeTool } from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// Define a tool that code can call
const fetchWeather = toolDefinition({
  name: 'fetchWeather',
  description: 'Get current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temp: z.number(), condition: z.string() }),
}).server(async ({ city }) => {
  const res = await fetch(`https://api.weather.com/${city}`)
  return res.json()
})

// Create code mode tool with Node isolate
const codeModeTool = createCodeModeTool({
  driver: createNodeIsolateDriver({
    memoryLimit: 128,
    timeout: 30000,
  }),
  tools: [fetchWeather],
})

// Use in chat
const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  tools: [codeModeTool],
})

return toServerSentEventsResponse(stream)
```

The recommended higher-level entry point is `createCodeMode()`, which returns both the tool and a matching system prompt:

```typescript
import { chat } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { openaiText } from '@tanstack/ai-openai'

const { tool, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather],
  timeout: 30_000,
})

const stream = chat({
  adapter: openaiText('gpt-4o'),
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  tools: [tool],
  messages,
})
```

`createCodeMode` calls `createCodeModeTool` and `createCodeModeSystemPrompt` internally. The system prompt includes generated TypeScript type stubs for each tool so the LLM writes correct calls.

## Core Patterns

### 1. Choosing an Isolate Driver

Three drivers implement the `IsolateDriver` interface. All are interchangeable.

**Node.js** (`createNodeIsolateDriver`) -- Full V8 with JIT. Fastest option. Requires `isolated-vm` native C++ addon.

```typescript
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'

const driver = createNodeIsolateDriver({
  memoryLimit: 128, // MB, default 128
  timeout: 30_000, // ms, default 30000
  // skipProbe: false -- set true only after verifying compatibility
})
```

**QuickJS** (`createQuickJSIsolateDriver`) -- WASM-based, no native deps. Works in Node.js, browsers, Deno, Bun, and edge runtimes. Slower (interpreted, no JIT). Limited stdlib (no File I/O).

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver({
  memoryLimit: 128, // MB, default 128
  timeout: 30_000, // ms, default 30000
  maxStackSize: 524288, // bytes, default 512 KiB
})
```

**Cloudflare** (`createCloudflareIsolateDriver`) -- Edge execution via a deployed Cloudflare Worker. Requires a `workerUrl` pointing to your deployed worker. Network latency on each tool call.

```typescript
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'

const driver = createCloudflareIsolateDriver({
  workerUrl: 'https://my-code-mode-worker.my-account.workers.dev',
  authorization: process.env.CODE_MODE_WORKER_SECRET,
  timeout: 30_000, // ms, default 30000
  maxToolRounds: 10, // max tool-call/result cycles, default 10
})
```

| Driver     | Best for                    | Native deps     | Browser support | Performance          |
| ---------- | --------------------------- | --------------- | --------------- | -------------------- |
| Node       | Server-side Node.js         | Yes (C++ addon) | No              | Fast (V8 JIT)        |
| QuickJS    | Browsers, edge, portability | None (WASM)     | Yes             | Slower (interpreted) |
| Cloudflare | Edge deployments            | None            | N/A             | Fast (V8 on edge)    |

### 2. Adding Persistent Skills with codeModeWithSkills()

Skills let the LLM save reusable code snippets. On future requests, relevant skills are loaded and exposed as callable tools.

```typescript
import { chat, maxIterations } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSkills } from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createCustomTrustStrategy,
} from '@tanstack/ai-code-mode-skills'
import { openaiText } from '@tanstack/ai-openai'

// Trust strategies control how skills earn trust through executions
// Default: untrusted -> provisional (10+ runs, >=90%) -> trusted (100+ runs, >=95%)
// Relaxed: untrusted -> provisional (3+ runs, >=80%) -> trusted (10+ runs, >=90%)
// Always trusted: immediately trusted (dev/testing)
// Custom: configurable thresholds
const trustStrategy = createDefaultTrustStrategy()

// Storage options: file system (production) or memory (testing)
const storage = createFileSkillStorage({
  directory: './.skills',
  trustStrategy,
})

const driver = createNodeIsolateDriver()

// High-level API: automatic LLM-based skill selection
const { toolsRegistry, systemPrompt, selectedSkills } =
  await codeModeWithSkills({
    config: {
      driver,
      tools: [myTool1, myTool2],
      timeout: 60_000,
      memoryLimit: 128,
    },
    adapter: openaiText('gpt-4o-mini'), // cheap model for skill selection
    skills: {
      storage,
      maxSkillsInContext: 5,
    },
    messages,
  })

const stream = chat({
  adapter: openaiText('gpt-4o'),
  tools: toolsRegistry.getTools(),
  messages,
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

The registry includes: `execute_typescript`, `search_skills`, `get_skill`, `register_skill`, and one tool per selected skill.

Custom trust strategy example:

```typescript
const strategy = createCustomTrustStrategy({
  initialLevel: 'untrusted',
  provisionalThreshold: { executions: 5, successRate: 0.85 },
  trustedThreshold: { executions: 50, successRate: 0.95 },
})
```

Storage implementations:

```typescript
// File storage (production) -- persists skills as files on disk
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
const fileStorage = createFileSkillStorage({ directory: './.skills' })

// Memory storage (testing) -- in-memory, lost on restart
import { createMemorySkillStorage } from '@tanstack/ai-code-mode-skills/storage'
const memStorage = createMemorySkillStorage()
```

### 3. Client-Side Execution Progress Display

Code Mode emits custom events during sandbox execution. Handle them in `useChat` via `onCustomEvent`.

Events emitted:

| Event                         | When                                 | Key fields                       |
| ----------------------------- | ------------------------------------ | -------------------------------- |
| `code_mode:execution_started` | Sandbox begins                       | `timestamp`, `codeLength`        |
| `code_mode:console`           | Each console.log/error/warn/info     | `level`, `message`, `timestamp`  |
| `code_mode:external_call`     | Before an external\_\* function runs | `function`, `args`, `timestamp`  |
| `code_mode:external_result`   | After successful external\_\* call   | `function`, `result`, `duration` |
| `code_mode:external_error`    | When external\_\* call fails         | `function`, `error`, `duration`  |

```typescript
import { useCallback, useRef, useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

interface VMEvent {
  id: string
  eventType: string
  data: unknown
  timestamp: number
}

export function CodeModeChat() {
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const eventIdCounter = useRef(0)

  const handleCustomEvent = useCallback(
    (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => {
      const { toolCallId } = context
      if (!toolCallId) return

      const event: VMEvent = {
        id: `event-${eventIdCounter.current++}`,
        eventType,
        data,
        timestamp: Date.now(),
      }

      setToolCallEvents((prev) => {
        const next = new Map(prev)
        const events = next.get(toolCallId) || []
        next.set(toolCallId, [...events, event])
        return next
      })
    },
    [],
  )

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    onCustomEvent: handleCustomEvent,
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part) => {
            if (part.type === 'text') {
              return <p key={part.id}>{part.content}</p>
            }
            if (
              part.type === 'tool-call' &&
              part.name === 'execute_typescript'
            ) {
              const events = toolCallEvents.get(part.id) || []
              return (
                <div key={part.id}>
                  <pre>{JSON.parse(part.arguments)?.typescriptCode}</pre>
                  {events.map((evt) => (
                    <div key={evt.id}>
                      {evt.eventType}: {JSON.stringify(evt.data)}
                    </div>
                  ))}
                  {part.output && (
                    <pre>{JSON.stringify(part.output, null, 2)}</pre>
                  )}
                </div>
              )
            }
            return null
          })}
        </div>
      ))}
    </div>
  )
}
```

The `onCustomEvent` callback signature is identical across all framework integrations (`@tanstack/ai-react`, `@tanstack/ai-solid`, `@tanstack/ai-vue`, `@tanstack/ai-svelte`):

```typescript
(eventType: string, data: unknown, context: { toolCallId?: string }) => void
```

Skill-specific events (when using `codeModeWithSkills`):

| Event                    | When               | Key fields                    |
| ------------------------ | ------------------ | ----------------------------- |
| `code_mode:skill_call`   | Skill tool invoked | `skill`, `input`, `timestamp` |
| `code_mode:skill_result` | Skill completed    | `skill`, `result`, `duration` |
| `code_mode:skill_error`  | Skill failed       | `skill`, `error`, `duration`  |
| `skill:registered`       | New skill saved    | `id`, `name`, `description`   |

## Common Mistakes

### CRITICAL: Passing API keys or secrets to the sandbox environment

Code Mode executes LLM-generated code. Any secrets available in the sandbox context are accessible to generated code, which could exfiltrate them via tool calls. Never pass API keys, database credentials, or tokens into the sandbox. Keep secrets in your tool server implementations, which run in the host process outside the sandbox.

Wrong:

```typescript
const codeModeTool = createCodeModeTool({
  driver,
  tools: [
    toolDefinition({
      name: 'callApi',
      inputSchema: z.object({ url: z.string(), apiKey: z.string() }),
      outputSchema: z.any(),
    }).server(async ({ url, apiKey }) =>
      fetch(url, {
        headers: { Authorization: apiKey },
      }),
    ),
  ],
})
```

Right:

```typescript
const codeModeTool = createCodeModeTool({
  driver,
  tools: [
    toolDefinition({
      name: 'callApi',
      inputSchema: z.object({ url: z.string() }),
      outputSchema: z.any(),
    }).server(async ({ url }) =>
      fetch(url, {
        headers: { Authorization: process.env.API_KEY }, // secret stays in host
      }),
    ),
  ],
})
```

Source: docs/code-mode/code-mode.md

### HIGH: Not setting timeout for code execution

LLM-generated code may contain infinite loops. The default timeout is 30s, but developers may override to 0 (no timeout). Always set an explicit, finite timeout.

Wrong:

```typescript
const driver = createNodeIsolateDriver({ timeout: 0 })
```

Right:

```typescript
const driver = createNodeIsolateDriver({ timeout: 30_000 })
```

Source: ai-code-mode source (default timeout in CodeModeToolConfig)

### HIGH: Using Node isolated-vm driver without checking platform compatibility

`isolated-vm` requires native module compilation. An incompatible build (wrong Node.js version, missing build tools) causes segfaults that no JS error handling can catch. The driver runs a subprocess probe by default. Never set `skipProbe: true` unless you have independently verified compatibility. Use `probeIsolatedVm()` to check before creating the driver.

```typescript
import {
  createNodeIsolateDriver,
  probeIsolatedVm,
} from '@tanstack/ai-isolate-node'

const probe = probeIsolatedVm()
if (!probe.compatible) {
  console.error('isolated-vm not compatible:', probe.error)
  // Fall back to QuickJS
}

// Never do this unless you verified compatibility yourself:
// const driver = createNodeIsolateDriver({ skipProbe: true })
```

Source: ai-isolate-node source (probeIsolatedVm implementation)

### MEDIUM: Expecting identical behavior across isolate drivers

The three drivers have different capabilities. Same code may work in Node but fail elsewhere.

- **Node**: Full V8 support, JIT compilation, configurable memory limit
- **QuickJS**: Interpreted, limited stdlib (no File I/O), configurable stack size, asyncified execution (serialized through global queue)
- **Cloudflare**: Network latency per tool call round-trip, `maxToolRounds` limit (default 10), requires deployed worker with `UNSAFE_EVAL` or `eval` unsafe binding

Test generated code against your target driver. If you need portability, target QuickJS's subset.

Source: docs/code-mode/code-mode-isolates.md

## Cross-References

- See also: ai-core/tool-calling/SKILL.md -- Code Mode is an alternative to standard tool calling for complex multi-step operations
- See also: ai-core/chat-experience/SKILL.md -- Code Mode requires handling custom events in useChat
