---
title: Code Mode
id: code-mode
order: 1
description: "LLM writes TypeScript that orchestrates tools in a sandbox — fewer agent loops, typed stubs."
keywords:
  - tanstack ai
  - code mode
  - sandbox
  - typescript execution
  - tool orchestration
  - execute_typescript
  - ai agents
---

# Code Mode

If tools already work in chat → let the model write one TypeScript program that orchestrates them in a sandbox instead of multi-step tool loops.

## Why

1. **Fewer tokens** — one `execute_typescript` call vs many tool round-trips
2. **Logic up front** — filter, `Promise.all`, branch inside the sandbox
3. **Typed stubs** — tools become typed `external_*` functions in the prompt
4. **Sandbox** — V8 / QuickJS / Cloudflare Worker; timeouts + memory limits

## Setup

### 1. Install

```bash
pnpm add @tanstack/ai @tanstack/ai-code-mode zod
```

Pick a driver:

```bash
pnpm add @tanstack/ai-isolate-node          # Node V8 (fastest)
pnpm add @tanstack/ai-isolate-quickjs       # WASM, portable
pnpm add @tanstack/ai-isolate-cloudflare    # Cloudflare edge
```

### 2. Define tools

```typescript group=code-mode
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const fetchWeather = toolDefinition({
  name: "fetchWeather",
  description: "Get current weather for a city",
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({
    temperature: z.number(),
    condition: z.string(),
  }),
}).server(async ({ location }) => {
  const res = await fetch(`https://api.weather.example/v1?city=${location}`);
  return res.json();
});
```

### 3. Create Code Mode

```typescript group=code-mode
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";

const { tool, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather],
  timeout: 30_000,
});
```

### 4. Use with `chat()`

```typescript group=code-mode
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const result = await chat({
  adapter: openaiText("gpt-5.5"),
  systemPrompts: [
    "You are a helpful weather assistant.",
    systemPrompt,
  ],
  tools: [tool],
  messages: [
    {
      role: "user",
      content: "Compare the weather in Tokyo, Paris, and New York City",
    },
  ],
});
```

Model may emit something like:

```typescript ignore
const cities = ["Tokyo", "Paris", "New York City"];
const results = await Promise.all(
  cities.map((city) => external_fetchWeather({ location: city }))
);

const warmest = results.reduce((prev, curr) =>
  curr.temperature > prev.temperature ? curr : prev
);

return {
  comparison: results.map((r, i) => ({
    city: cities[i],
    temperature: r.temperature,
    condition: r.condition,
  })),
  warmest: cities[results.indexOf(warmest)],
};
```

## API

### `createCodeMode(config)`

```typescript ignore
const { tool, systemPrompt } = createCodeMode({
  driver,           // IsolateDriver — required
  tools,            // ServerTool[] — required, need .server()
  timeout,          // ms (default 30000)
  memoryLimit,      // MB (default 128; Node + QuickJS)
  getSkillBindings, // optional dynamic bindings
});
```

| Property | Type | Description |
|----------|------|-------------|
| `driver` | `IsolateDriver` | Sandbox runtime |
| `tools` | `Array<ServerTool \| ToolDefinition>` | Become `external_*` |
| `timeout` | `number` | Execution timeout ms |
| `memoryLimit` | `number` | Heap MB |
| `getSkillBindings` | `() => Promise<Record<string, ToolBinding>>` | Extra bindings |

Result:

```typescript
interface CodeModeToolResult {
  success: boolean;
  result?: unknown;
  logs?: Array<string>;
  error?: { message: string; name?: string; line?: number };
}
```

### Split helpers

```typescript
import {
  createCodeModeTool,
  createCodeModeSystemPrompt,
} from "@tanstack/ai-code-mode";
import { config } from "./config";

const tool = createCodeModeTool(config);
const prompt = createCodeModeSystemPrompt(config);
```

### Drivers

| Package | Factory | Environment |
|---------|---------|-------------|
| `@tanstack/ai-isolate-node` | `createNodeIsolateDriver()` | Node.js |
| `@tanstack/ai-isolate-quickjs` | `createQuickJSIsolateDriver()` | Node, browser, edge |
| `@tanstack/ai-isolate-cloudflare` | `createCloudflareIsolateDriver()` | Cloudflare Workers |

Full options: [Isolate Drivers](./code-mode-isolates.md).

**Rule of thumb:** Node for servers · QuickJS for portable/edge without Workers deploy · Cloudflare when you already run Workers.

### Internals (exported)

- `stripTypeScript(code)` — sucrase strip to JS
- `toolsToBindings(tools, prefix?)` — tool → bindings
- `generateTypeStubs(bindings, options?)` — prompt type stubs

## Custom events

| Event | When | Payload |
|-------|------|---------|
| `code_mode:execution_started` | Start | `timestamp`, `codeLength` |
| `code_mode:console` | log/error/warn/info | `level`, `message`, `timestamp` |
| `code_mode:external_call` | Before tool | `function`, `args`, `timestamp` |
| `code_mode:external_result` | After tool | `function`, `result`, `duration` |
| `code_mode:external_error` | Tool fail | `function`, `error`, `duration` |

UI: [Showing Code Mode in the UI](./client-integration).

## Model compatibility

Single multi-step benchmark (join/filter/aggregate). Harness: `packages/ai-code-mode/models-eval/`.

| Rank | Model | Stars | Acc | Comp | TS | CME | Latency | Tokens |
|------|-------|:-----:|:---:|:----:|:--:|:---:|--------:|-------:|
| 1 | `grok:grok-4-1-fast-non-reasoning` | ★★★ | 10 | 9 | 6 | 10 | 7.0s | — |
| 2 | `ollama:gpt-oss:20b` | ★★★ | 10 | 8 | 6 | 5 | 45.1s | 23.6k |
| 3 | `anthropic:claude-haiku-4-5` | ★★★ | 10 | 10 | 7 | 10 | 9.4s | 8.5k |
| 4 | `gemini:gemini-2.5-flash` | ★★★ | 10 | 7 | 5 | 9 | 7.3s | 6.9k |
| 5 | `ollama:nemotron-cascade-2` | ★★★ | 10 | 9 | 5 | 5 | 60.4s | 11.7k |
| 6 | `openai:gpt-4o-mini` | ★★☆ | 10 | 8 | 8 | 10 | 19.2s | 8.7k |
| 7 | `ollama:gemma4:31b` | ★★☆ | 10 | 8 | 4 | 5 | 264.2s | 6.4k |

- **Stars** — weighted overall (1–3)
- **Acc / Comp / TS / CME** — accuracy, comprehensiveness, TS quality, code-mode efficiency ( /10)
- **Latency / Tokens** — full loop wall time and usage (Grok adapter omits usage)

**Takeaways**

1. Cloud under 10s: Grok 4.1 Fast, Claude Haiku 4.5, Gemini 2.5 Flash
2. Best local: `ollama:gpt-oss:20b` (~45s)
3. Avoid tiny locals that ignore `external_*` / refuse `execute_typescript`
4. Single-prompt bench — use as a filter, not a ranking

```bash
cd packages/ai-code-mode/models-eval
pnpm install
pnpm eval
pnpm eval -- --ollama-only
pnpm eval -- --no-judge
```

## Tips

1. Start with 2–3 focused tools.
2. Prefer tasks that benefit from `Promise.all`.
3. Use `console.log` — logs return in the result.
4. Inspect `createCodeModeSystemPrompt(config)` to see model-facing stubs.

## Next

- [Client UI](./client-integration) · [Skills](./code-mode-with-skills) · [Isolates](./code-mode-isolates)
