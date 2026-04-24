---
title: Code Mode
id: code-mode
order: 1
description: "Let LLMs write and execute TypeScript programs that orchestrate tools in a secure sandbox with TanStack AI Code Mode — fewer loops, richer logic."
keywords:
  - tanstack ai
  - code mode
  - sandbox
  - typescript execution
  - tool orchestration
  - execute_typescript
  - ai agents
---

Code Mode lets an LLM write and execute TypeScript programs inside a secure sandbox. Instead of making one tool call at a time, the model writes a short script that orchestrates multiple tools with loops, conditionals, `Promise.all`, and data transformations — then returns a single result.

You already have a chat app that uses [tools](../tools/tools). By the end of this guide, you'll have Code Mode set up so the LLM can compose those tools in TypeScript and execute them in a single sandbox call.

## Why Code Mode?

### Reduced context window usage

In a traditional agentic loop, every tool call adds a round-trip of messages: the model's tool-call request, the tool result, then the model's next reasoning step. A task that touches five tools can easily consume thousands of tokens in back-and-forth.

With Code Mode the model emits one `execute_typescript` call containing a complete program. The five tool invocations happen inside the sandbox, and only the final result comes back — one request, one response.

### The LLM decides how to interpret tool output

When tools are called individually, the model must decide what to do with each result in a new turn. With Code Mode, the model writes the logic up front: filter, aggregate, compare, branch. It can `Promise.all` ten API calls, pick the best result, and return a summary — all in a single execution.

### Type-safe tool execution

Tools you pass to Code Mode are converted to typed function stubs that appear in the system prompt. The model sees exact input/output types, so it generates correct calls without guessing parameter names or shapes. TypeScript annotations in the generated code are stripped automatically before execution.

### Secure sandboxing

Generated code runs in an isolated environment (V8 isolate, QuickJS WASM, or Cloudflare Worker) with no access to the host file system, network, or process. The sandbox has configurable timeouts and memory limits.

## Getting Started

### 1. Install packages

```bash
pnpm add @tanstack/ai @tanstack/ai-code-mode zod
```

Pick an isolate driver:

```bash
# Node.js — fastest, uses V8 isolates (requires native compilation)
pnpm add @tanstack/ai-isolate-node

# QuickJS WASM — no native deps, works in browsers and edge runtimes
pnpm add @tanstack/ai-isolate-quickjs

# Cloudflare Workers — run on the edge
pnpm add @tanstack/ai-isolate-cloudflare
```

### 2. Define tools

Define your tools with `toolDefinition()` and provide a server-side implementation with `.server()`. These become the `external_*` functions available inside the sandbox.

```typescript
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

### 3. Create the Code Mode tool and system prompt

```typescript
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";

const { tool, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather],
  timeout: 30_000,
});
```

### 4. Use with `chat()`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const result = await chat({
  adapter: openaiText(),
  model: "gpt-4o",
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

The model will generate something like:

```typescript
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

All three API calls happen in parallel inside the sandbox. The model receives one structured result instead of three separate tool-call round-trips.

## API Reference

### `createCodeMode(config)`

Creates both the `execute_typescript` tool and its matching system prompt from a single config object. This is the recommended entry point.

```typescript
const { tool, systemPrompt } = createCodeMode({
  driver,          // IsolateDriver — required
  tools,           // Array<ServerTool | ToolDefinition> — required, at least one
  timeout,         // number — execution timeout in ms (default: 30000)
  memoryLimit,     // number — memory limit in MB (default: 128, Node + QuickJS drivers)
  getSkillBindings, // () => Promise<Record<string, ToolBinding>> — optional dynamic bindings
});
```

**Config properties:**

| Property | Type | Description |
|----------|------|-------------|
| `driver` | `IsolateDriver` | The sandbox runtime to execute code in |
| `tools` | `Array<ServerTool \| ToolDefinition>` | Tools exposed as `external_*` functions. Must have `.server()` implementations |
| `timeout` | `number` | Execution timeout in milliseconds (default: 30000) |
| `memoryLimit` | `number` | Memory limit in MB (default: 128). Supported by Node and QuickJS drivers |
| `getSkillBindings` | `() => Promise<Record<string, ToolBinding>>` | Optional function returning additional bindings at execution time |

The tool returns a `CodeModeToolResult`:

```typescript
interface CodeModeToolResult {
  success: boolean;
  result?: unknown;    // Return value from the executed code
  logs?: Array<string>; // Captured console output
  error?: {
    message: string;
    name?: string;
    line?: number;
  };
}
```

### `createCodeModeTool(config)` / `createCodeModeSystemPrompt(config)`

Lower-level functions if you need only the tool or only the prompt. `createCodeMode` calls both internally.

```typescript
import { createCodeModeTool, createCodeModeSystemPrompt } from "@tanstack/ai-code-mode";

const tool = createCodeModeTool(config);
const prompt = createCodeModeSystemPrompt(config);
```

### `IsolateDriver`

The interface that sandbox runtimes implement. You do not implement this yourself — pick one of the provided drivers:

```typescript
interface IsolateDriver {
  createContext(config: IsolateConfig): Promise<IsolateContext>;
}
```

**Available drivers:**

| Package | Factory function | Environment |
|---------|-----------------|-------------|
| `@tanstack/ai-isolate-node` | `createNodeIsolateDriver()` | Node.js |
| `@tanstack/ai-isolate-quickjs` | `createQuickJSIsolateDriver()` | Node.js, browser, edge |
| `@tanstack/ai-isolate-cloudflare` | `createCloudflareIsolateDriver()` | Cloudflare Workers |

For full configuration options for each driver, see [Isolate Drivers](./code-mode-isolates.md).

### Advanced

These utilities are used internally and are exported for custom pipelines:

- **`stripTypeScript(code)`** — Strips TypeScript syntax using esbuild, converting to plain JavaScript.
- **`toolsToBindings(tools, prefix?)`** — Converts TanStack AI tools into `Record<string, ToolBinding>` for sandbox injection.
- **`generateTypeStubs(bindings, options?)`** — Generates TypeScript type declarations from tool bindings for system prompts.

## Choosing a Driver

For a full comparison of drivers with all configuration options, see [Isolate Drivers](./code-mode-isolates.md).

In brief: use the **Node driver** for server-side Node.js (fastest, V8 JIT), **QuickJS** for browsers or portable edge deployments (no native deps), and the **Cloudflare driver** when you deploy to Cloudflare Workers.

## Custom Events

Code Mode emits custom events during execution that you can observe through the TanStack AI event system. These are useful for building UIs that show execution progress, debugging, or logging.

| Event | When | Payload |
|-------|------|---------|
| `code_mode:execution_started` | Code execution begins | `{ timestamp, codeLength }` |
| `code_mode:console` | Each `console.log/error/warn/info` call | `{ level, message, timestamp }` |
| `code_mode:external_call` | Before an `external_*` function runs | `{ function, args, timestamp }` |
| `code_mode:external_result` | After a successful `external_*` call | `{ function, result, duration }` |
| `code_mode:external_error` | When an `external_*` call fails | `{ function, error, duration }` |

To display these events in your React app, see [Showing Code Mode in the UI](./client-integration).

## Model Compatibility

Code Mode asks the model to write valid TypeScript that calls your tools through the sandbox bridge. Not every model handles this equally — many small or older models mishandle the `external_*` calling conventions even when the system prompt is explicit. We track a single multi-step benchmark (joining three tables, filtering customers who bought from every product category, aggregating spend per category) against a gold reference. The full harness lives at `packages/typescript/ai-code-mode/models-eval/`.

| Rank | Model | Stars | Acc | Comp | TS | CME | Latency | Tokens |
|------|-------|:-----:|:---:|:----:|:--:|:---:|--------:|-------:|
| 1 | `grok:grok-4-1-fast-non-reasoning` | ★★★ | 10 | 9 | 6 | 10 | 7.0s | — |
| 2 | `ollama:gpt-oss:20b` | ★★★ | 10 | 8 | 6 | 5 | 45.1s | 23.6k |
| 3 | `anthropic:claude-haiku-4-5` | ★★★ | 10 | 10 | 7 | 10 | 9.4s | 8.5k |
| 4 | `gemini:gemini-2.5-flash` | ★★★ | 10 | 7 | 5 | 9 | 7.3s | 6.9k |
| 5 | `ollama:nemotron-cascade-2` | ★★★ | 10 | 9 | 5 | 5 | 60.4s | 11.7k |
| 6 | `openai:gpt-4o-mini` | ★★☆ | 10 | 8 | 8 | 10 | 19.2s | 8.7k |
| 7 | `ollama:gemma4:31b` | ★★☆ | 10 | 8 | 4 | 5 | 264.2s | 6.4k |

**Columns**

- **Stars** — overall weighted rating (1-3) combining accuracy, comprehensiveness, code quality, code-mode efficiency, speed, token efficiency, and stability.
- **Acc / Comp / TS / CME** — Anthropic-judged subscores out of 10: accuracy vs gold, comprehensiveness, TypeScript quality, code-mode efficiency (fewer wasted attempts is better).
- **Latency** — wall-clock time for the full agentic loop.
- **Tokens** — total prompt + completion tokens. Grok's adapter does not report usage.

**Takeaways**

- **Strongest cloud picks:** Grok 4.1 Fast, Claude Haiku 4.5, and Gemini 2.5 Flash all finish under 10s and handle the multi-step task cleanly. Claude Haiku 4.5 has the highest comprehensiveness score (10/10).
- **Strongest local pick:** `ollama:gpt-oss:20b` is the best local performer at 45s with zero compilation failures. `ollama:nemotron-cascade-2` is a close second.
- **Avoid:** the smaller `gemma4` (9.6 GB) and the other local models commented out at the top of `eval-config.ts` (`granite4:3b`, `ministral-3`, `mistral:7b`, `qwen3:8b`, etc.) — they either ignore the `external_queryTable` shape, hallucinate results, or refuse to invoke `execute_typescript`.
- **Caveat:** this is a single‑prompt benchmark. Local model results can vary noticeably between runs; use these as a rough capability filter rather than a definitive ranking.

Reproduce locally:

```bash
cd packages/typescript/ai-code-mode/models-eval
pnpm install
pnpm eval                    # full suite (needs cloud API keys + Anthropic for judging)
pnpm eval -- --ollama-only   # local models only
pnpm eval -- --no-judge      # skip Anthropic-based judging
```

## Tips

- **Start simple.** Give the model 2-3 tools and a clear task. Code Mode works best when the model has a focused set of capabilities.
- **Prefer `Promise.all` tasks.** Code Mode shines when the model can parallelize work that would otherwise be sequential tool calls.
- **Use `console.log` for debugging.** Logs are captured and returned in the result, making it easy to see what happened inside the sandbox.
- **Keep tools focused.** Each tool should do one thing well. The model will compose them in code.
- **Check the system prompt.** Call `createCodeModeSystemPrompt(config)` and inspect the output to see exactly what the model will see, including generated type stubs.

## Next Steps

- [Showing Code Mode in the UI](./client-integration) — Display execution progress in your React app
- [Code Mode with Skills](./code-mode-with-skills) — Add persistent, reusable skill libraries
- [Isolate Drivers](./code-mode-isolates) — Compare Node, QuickJS, and Cloudflare sandbox runtimes
