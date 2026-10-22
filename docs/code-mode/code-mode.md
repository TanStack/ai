---
title: Code Mode
id: code-mode
order: 1
description: "Let the model write one short TypeScript program that calls your tools in a sandbox, instead of one tool call per turn."
keywords:
  - tanstack ai
  - code mode
  - sandbox
  - typescript execution
  - tool orchestration
  - execute_typescript
  - ai agents
---

Code Mode lets the model write one program that calls several tools. One sandbox run replaces one round trip per tool.

The model gets one tool, `execute_typescript`, and you get one result back.

## Quick setup

You need a working chat first. If you do not have one, start with the [Quick Start](../getting-started/quick-start). This setup takes about 5 minutes.

1. Install Code Mode and the Node sandbox driver:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
vue: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
solid: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
svelte: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
preact: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
angular: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
vanilla: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod
octane: @tanstack/ai @tanstack/ai-code-mode @tanstack/ai-isolate-node @tanstack/ai-openai zod

<!-- ::end:tabs -->

The Node driver needs Node.js 22 or later. On Bun, the edge, or Cloudflare, pick a different driver from [Isolate Drivers](./code-mode-isolates).

2. Replace your chat route with this one. It defines a tool, wraps it with `createCodeMode`, and gives the result to `chat()`:

```typescript
// app/api/chat/route.ts (Next.js). Any route that takes a Request works.
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from "@tanstack/ai";
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const temperatures: Record<string, number> = {
  Tokyo: 18,
  Paris: 12,
  "New York City": 9,
};

const fetchWeather = toolDefinition({
  name: "fetchWeather",
  description: "Get current weather for a city",
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({
    temperature: z.number(),
    condition: z.string(),
  }),
}).server(async ({ location }) => ({
  temperature: temperatures[location] ?? 20,
  condition: "sunny",
}));

const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather],
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    systemPrompts: ["You are a helpful weather assistant.", systemPrompt],
    tools,
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

3. Open your chat and send: "Compare the weather in Tokyo, Paris, and New York City."

The model calls `execute_typescript` one time, with a program like this:

```typescript ignore
const cities = ["Tokyo", "Paris", "New York City"];
const results = await Promise.all(
  cities.map((city) => external_fetchWeather({ location: city }))
);

const warmest = results.reduce((prev, curr) =>
  curr.temperature > prev.temperature ? curr : prev
);

return {
  comparison: results.map((r, i) => ({ city: cities[i], ...r })),
  warmest: cities[results.indexOf(warmest)],
};
```

The three weather calls run in parallel inside the sandbox. The model gets one result and writes its answer from it.

## How it works

- `createCodeMode` turns each tool into a typed `external_<name>` function, for example `external_fetchWeather`.
- `systemPrompt` shows the model the TypeScript types of these functions. The model sees the exact input and output shapes.
- `tools` holds the `execute_typescript` tool. Give it to `chat()`.
- When the model calls `execute_typescript`, Code Mode strips the TypeScript types and runs the code in a fresh sandbox.
- Each `external_*` call leaves the sandbox and runs your real tool on your server. The sandbox code cannot reach the host.

The Node, QuickJS, QuickJS Bun, and Cloudflare drivers have no access to the host file system, network, or process. The Daytona and E2B drivers run the code in a full remote Linux sandbox, with its own file system, network, and processes.

## Add more

- **Show the run to your users:** [Showing Code Mode in the UI](./client-integration).
- **Run somewhere other than Node:** [Isolate Drivers](./code-mode-isolates).
- **Let the model save and reuse code:** [Code Mode with Snippets](./code-mode-with-snippets).
- **Have many tools:** [Lazy Tools](./lazy-tools) keeps rarely used tools out of the prompt.

## Advanced

### Stop tool calls when the run stops

When a user stops a chat run, a tool call that the sandbox started keeps going, unless the tool listens for the abort. Each `external_*` call gets the `abortSignal` of the chat run in its second argument. Pass it to the slow work:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const searchDocs = toolDefinition({
  name: "searchDocs",
  description: "Search the docs",
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }, ctx) => {
  const res = await fetch(
    `https://search.example/v1?q=${encodeURIComponent(query)}`,
    { signal: ctx?.abortSignal },
  );
  return res.json();
});
```

MCP tools from `@tanstack/ai-mcp` already stop their request when the run aborts.

A tool that runs inside Code Mode gets these fields:

- `abortSignal`: the signal of the chat run. If the run is already aborted, the call does not start.
- `context`: the runtime `context` that you gave to `chat()`.
- `emitCustomEvent`: sends a custom event to the stream. A tool that a `snippet_*` function calls does not send events.

The tool does not get `toolCallId` or `inputResponse`. These fields belong to the `execute_typescript` call.

### `createCodeMode` options

| Option | Type | Description |
|--------|------|-------------|
| `driver` | `IsolateDriver` | Required. The sandbox that runs the code. See [Isolate Drivers](./code-mode-isolates). |
| `tools` | `Array<ServerTool>` | Required, at least one. Each tool needs a `.server()` implementation. Each one becomes an `external_*` function. |
| `timeout` | `number` | Time limit for one execution, in ms. Default: `30000`. |
| `memoryLimit` | `number` | Memory limit in MB. Default: `128`. The Node, QuickJS, QuickJS Bun, and E2B drivers use it. |
| `getSnippetBindings` | `() => Promise<Record<string, ToolBinding>>` | Extra bindings that load at each execution. [Snippets](./code-mode-with-snippets) use it. |
| `lazyToolsConfig` | `LazyToolsConfig` | How much of each lazy tool the catalog shows. See [Lazy Tools](./lazy-tools). |
| `onSecretParameter` | `'warn' \| 'throw' \| 'ignore' \| (info) => void` | What to do when a tool parameter name looks like a secret. Default: `'warn'`. |
| `transpile` | `(code: string) => string \| Promise<string>` | Replaces the step that strips TypeScript. The default uses sucrase and is safe for browsers and the edge. |
| `debug` | `DebugOption` | Debug logging, same shape as `chat({ debug })`. Failed executions log under `errors` (on by default). Successful ones log under `tools`. Pass `false` to silence it. See [Debug Logging](../advanced/debug-logging.md). |

`createCodeMode` returns:

- `tool`: the `execute_typescript` tool.
- `discoveryTool`: the `discover_tools` tool, or `null` when no tool is lazy.
- `tools`: `[tool]`, or `[tool, discoveryTool]`. Give this array to `chat()`.
- `systemPrompt`: the matching system prompt.

A custom `transpile` function must accept top-level `return` and `await`. The [snippet](./code-mode-with-snippets) helpers ignore `transpile` and always use the default.

### The result of `execute_typescript`

```typescript
interface CodeModeToolResult {
  success: boolean;
  result?: unknown; // Return value of the code
  logs?: Array<string>; // Captured console output
  error?: {
    message: string;
    name?: string;
    line?: number;
    stack?: string;
  };
}
```

### Lower-level functions

`createCodeMode` calls two functions. When you need only the tool or only the prompt, use them:

```typescript ignore
import {
  createCodeModeTool,
  createCodeModeSystemPrompt,
} from "@tanstack/ai-code-mode";

const tool = createCodeModeTool(config);
const prompt = createCodeModeSystemPrompt(config);
```

`@tanstack/ai-code-mode` also exports these helpers for custom pipelines:

- `stripTypeScript(code)`: strips TypeScript syntax with sucrase. It needs no native binary, so it runs on the edge.
- `toolsToBindings(tools, prefix?)`: turns tools into `Record<string, ToolBinding>` for a sandbox.
- `generateTypeStubs(bindings, options?)`: writes TypeScript declarations for bindings, for a system prompt.

### Custom events

Code Mode sends these custom events while it runs. Each event carries the `toolCallId` of its `execute_typescript` call. [Showing Code Mode in the UI](./client-integration) renders them.

| Event | When | Payload |
|-------|------|---------|
| `code_mode:execution_started` | The execution starts | `{ timestamp, codeLength }` |
| `code_mode:console` | For each `console.log`, `error`, `warn`, or `info` call | `{ level, message, timestamp }` |
| `code_mode:external_call` | Before an `external_*` function runs | `{ function, args, timestamp }` |
| `code_mode:external_result` | After an `external_*` call succeeds | `{ function, result, duration }` |
| `code_mode:external_error` | When an `external_*` call fails | `{ function, error, duration }` |
| `code_mode:execution_finished` | The execution ends, with success or failure | `{ timestamp, durationMs, phase, success, logCount, error }` |

### Model compatibility

Code Mode needs a model that writes valid TypeScript and calls the `external_*` functions correctly. Many small or older models get the calling convention wrong, even with a clear system prompt.

We run one multi-step benchmark against a gold reference. The task joins three tables, finds customers who bought from every product category, and sums the spend per category. The harness is in `packages/ai-code-mode/models-eval/`.

| Rank | Model | Stars | Acc | Comp | TS | CME | Latency | Tokens |
|------|-------|:-----:|:---:|:----:|:--:|:---:|--------:|-------:|
| 1 | `grok:grok-4-1-fast-non-reasoning` | ★★★ | 10 | 9 | 6 | 10 | 7.0s | n/a |
| 2 | `ollama:gpt-oss:20b` | ★★★ | 10 | 8 | 6 | 5 | 45.1s | 23.6k |
| 3 | `anthropic:claude-haiku-4-5` | ★★★ | 10 | 10 | 7 | 10 | 9.4s | 8.5k |
| 4 | `gemini:gemini-2.5-flash` | ★★★ | 10 | 7 | 5 | 9 | 7.3s | 6.9k |
| 5 | `ollama:nemotron-cascade-2` | ★★★ | 10 | 9 | 5 | 5 | 60.4s | 11.7k |
| 6 | `openai:gpt-4o-mini` | ★★☆ | 10 | 8 | 8 | 10 | 19.2s | 8.7k |
| 7 | `ollama:gemma4:31b` | ★★☆ | 10 | 8 | 4 | 5 | 264.2s | 6.4k |

The columns:

- **Stars:** the overall rating (1 to 3). It combines accuracy, completeness, code quality, Code Mode efficiency, speed, token use, and stability.
- **Acc, Comp, TS, CME:** scores out of 10 from an Anthropic judge. They are accuracy against the gold result, completeness, TypeScript quality, and Code Mode efficiency (fewer wasted attempts is better).
- **Latency:** the wall-clock time for the full agent loop.
- **Tokens:** the total prompt and completion tokens. The Grok adapter does not report usage.

What the results show:

- **Best cloud models:** Grok 4.1 Fast, Claude Haiku 4.5, and Gemini 2.5 Flash finish in less than 10s and do the task correctly. Claude Haiku 4.5 has the highest completeness score (10/10).
- **Best local model:** `ollama:gpt-oss:20b` takes 45s and has zero compile failures. `ollama:nemotron-cascade-2` is a close second.
- **Avoid:** the smaller `gemma4` (9.6 GB) and the local models that are commented out at the top of `eval-config.ts` (for example `granite4:3b`, `ministral-3`, `mistral:7b`, `qwen3:8b`). They ignore the `external_queryTable` shape, invent results, or do not call `execute_typescript`.
- **Limit:** this benchmark uses one prompt. Local model results change between runs. Use them as a rough filter, not a final ranking.

To run the benchmark yourself:

```bash
cd packages/ai-code-mode/models-eval
pnpm install
pnpm eval                    # full suite (needs cloud API keys + Anthropic for judging)
pnpm eval -- --ollama-only   # local models only
pnpm eval -- --no-judge      # skip Anthropic-based judging
```

### Tips

- **Start small.** Give the model 2 or 3 tools and a clear task.
- **Use it for parallel work.** Code Mode helps most when the model can `Promise.all` calls that otherwise need separate tool turns.
- **Read the logs.** The result returns the `console.log` output of the code.
- **Keep each tool focused.** One tool does one thing. The model combines them in code.
- **Read the prompt.** Call `createCodeModeSystemPrompt(config)` and print it to see the type stubs that the model sees.
