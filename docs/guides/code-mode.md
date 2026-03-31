---
title: Code Mode
id: code-mode
order: 19
---

Code Mode lets an LLM write and execute TypeScript programs inside a secure sandbox. Instead of making one tool call at a time, the model writes a short script that orchestrates multiple tools with loops, conditionals, `Promise.all`, and data transformations — then returns a single result.

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
import { createCodeModeToolAndPrompt } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";

const { tool, systemPrompt } = createCodeModeToolAndPrompt({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather],
  timeout: 30_000,
});
```

### 4. Use with `chat()`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai/adapters";

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

### `createCodeModeToolAndPrompt(config)`

Creates both the `execute_typescript` tool and its matching system prompt from a single config object. This is the recommended entry point.

```typescript
const { tool, systemPrompt } = createCodeModeToolAndPrompt({
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

Lower-level functions if you need only the tool or only the prompt. `createCodeModeToolAndPrompt` calls both internally.

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

### Advanced

These utilities are used internally and are exported for custom pipelines:

- **`stripTypeScript(code)`** — Strips TypeScript syntax using esbuild, converting to plain JavaScript.
- **`toolsToBindings(tools, prefix?)`** — Converts TanStack AI tools into `Record<string, ToolBinding>` for sandbox injection.
- **`generateTypeStubs(bindings, options?)`** — Generates TypeScript type declarations from tool bindings for system prompts.

## Choosing a Driver

| | Node (`isolated-vm`) | QuickJS (WASM) | Cloudflare Workers |
|---|---|---|---|
| **Best for** | Server-side Node.js apps | Browsers, edge, portability | Edge deployments on Cloudflare |
| **Performance** | Fast (V8 JIT) | Slower (interpreted) | Fast (V8 on edge) |
| **Native deps** | Yes (C++ addon) | None | None |
| **Browser support** | No | Yes | N/A |
| **Memory limit** | Configurable | Configurable | N/A |
| **Setup** | `pnpm add` | `pnpm add` | Deploy a Worker first |

For server-side Node.js applications, the Node driver gives the best performance. For browser-based or portable applications, QuickJS avoids any native compilation step. The Cloudflare driver is ideal when you already deploy to Cloudflare Workers.

## Custom Events

Code Mode emits custom events during execution that you can observe through the TanStack AI event system. These are useful for building UIs that show execution progress, debugging, or logging.

| Event | When | Payload |
|-------|------|---------|
| `code_mode:execution_started` | Code execution begins | `{ timestamp, codeLength }` |
| `code_mode:console` | Each `console.log/error/warn/info` call | `{ level, message, timestamp }` |
| `code_mode:external_call` | Before an `external_*` function runs | `{ function, args, timestamp }` |
| `code_mode:external_result` | After a successful `external_*` call | `{ function, result, duration }` |
| `code_mode:external_error` | When an `external_*` call fails | `{ function, error, duration }` |

## Model Evaluation

Code Mode includes a development benchmark package at `packages/typescript/ai-code-mode/models-eval`.

Recommended workflow:

1. Capture raw model outputs and telemetry (no judge call):

```bash
pnpm --filter @tanstack/ai-code-mode-models-eval eval:capture
```

2. Judge the latest captured session from logs (no model rerun):

```bash
pnpm --filter @tanstack/ai-code-mode-models-eval eval:judge
```

3. Canonical benchmark output is written to:

`packages/typescript/ai-code-mode/models-eval/results.json`

### Evaluation methodology

Metrics:

- `accuracy` (1-10): factual correctness vs gold reference
- `comprehensiveness` (1-10): how fully the response answers the user request
- `typescriptQuality` (1-10): quality/readability/type-safety of generated TypeScript
- `codeModeEfficiency` (1-10): how efficiently the model reaches the solution in code mode
- `speedTier` (1-5): relative wall-clock speed within `local` and `cloud` groups
- `tokenEfficiencyTier` (1-5): relative tokens-per-successful-execution within `local` and `cloud` groups
- `stabilityTier` (1-5): consistency over latest 5 logged runs per model
- `stars` (1-3): weighted rollup score

Stability definition:

- A run is considered stable when it has:
  - no top-level run error
  - non-empty final candidate report
  - at least one successful `execute_typescript` call

Star rollup weights:

- accuracy: 25%
- comprehensiveness: 15%
- typescriptQuality: 15%
- codeModeEfficiency (with compile/runtime failure penalty): 10%
- speedTier: 10%
- tokenEfficiencyTier: 10%
- stabilityTier: 15%

### Canonical model results

The canonical source of truth is:

- `packages/typescript/ai-code-mode/models-eval/results.json`

Current human-readable snapshot (session `2026-03-26T15:38:44.006Z`):

- **Top overall (★★★):** GPT-OSS 20B, Claude Haiku 4.5, GPT-4o Mini, Gemini 2.5 Flash, Grok 4.1 Fast, Llama 3.3 70B (Groq)
- **Strong but below top tier (★★☆):** Nemotron Cascade 2, Qwen3 32B (Groq)
- **Notable caveat:** Llama 3.3 70B shows high quality when it works, but lower stability (`stabilityTier: 4`) versus most models at `5`

| Model | Stars | Accuracy | Code-Mode | Speed | Token Eff. | Stability |
|---|---:|---:|---:|---:|---:|---:|
| GPT-OSS 20B | ★★★ | 10 | 5 | 5 | 5 | 5 |
| Nemotron Cascade 2 | ★★☆ | 3 | 5 | 1 | 5 | 5 |
| Claude Haiku 4.5 | ★★★ | 10 | 7 | 3 | 2 | 5 |
| GPT-4o Mini | ★★★ | 10 | 9 | 3 | 1 | 5 |
| Gemini 2.5 Flash | ★★★ | 10 | 10 | 4 | 2 | 5 |
| Grok 4.1 Fast | ★★★ | 10 | 10 | 4 | 5 | 5 |
| Llama 3.3 70B (Groq) | ★★★ | 10 | 9 | 5 | 3 | 4 |
| Qwen3 32B (Groq) | ★★☆ | 10 | 4 | 1 | 2 | 5 |

For full details (including comprehensiveness, TypeScript quality, token counts, and judge summaries), use:

- `packages/typescript/ai-code-mode/README.md`

## Tips

- **Start simple.** Give the model 2-3 tools and a clear task. Code Mode works best when the model has a focused set of capabilities.
- **Prefer `Promise.all` tasks.** Code Mode shines when the model can parallelize work that would otherwise be sequential tool calls.
- **Use `console.log` for debugging.** Logs are captured and returned in the result, making it easy to see what happened inside the sandbox.
- **Keep tools focused.** Each tool should do one thing well. The model will compose them in code.
- **Check the system prompt.** Call `createCodeModeSystemPrompt(config)` and inspect the output to see exactly what the model will see, including generated type stubs.
