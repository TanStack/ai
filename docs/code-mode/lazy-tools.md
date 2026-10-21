---
title: Lazy Tools
id: lazy-tools
order: 5
description: "Keep rarely used tools out of the Code Mode system prompt. The model gets their TypeScript signatures on demand with a discover_tools call."
keywords:
  - tanstack ai
  - code mode
  - lazy tools
  - discover_tools
  - progressive disclosure
  - prompt size
  - tool catalog
---

Each tool that you give to [Code Mode](./code-mode) adds a full TypeScript type stub to the system prompt. With 50 or more tools, the prompt can grow to tens of thousands of tokens before the model reads the user message.

Mark the rarely used tools `lazy: true`. The prompt then lists only their names. When the model needs one, it calls `discover_tools` to get the signature, then uses the tool in `execute_typescript`.

## Quick setup

You need the route from the [Code Mode quick setup](./code-mode#quick-setup) first.

1. Add `lazy: true` to each tool that most requests do not need:

```typescript group=lazy-tools
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// Eager: the full type stub is in the system prompt
const fetchWeather = toolDefinition({
  name: "fetchWeather",
  description: "Get current weather for a city",
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), condition: z.string() }),
}).server(async ({ location }) => ({
  temperature: location.length + 10,
  condition: "sunny",
}));

// Lazy: only the name is in the system prompt, until the model discovers it
const fetchArchive = toolDefinition({
  name: "fetchArchive",
  description: "Retrieve historical weather archive data for a date range",
  inputSchema: z.object({
    location: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  outputSchema: z.array(z.object({ date: z.string(), temperature: z.number() })),
  lazy: true,
}).server(async ({ from, to }) => [
  { date: from, temperature: 14 },
  { date: to, temperature: 16 },
]);
```

2. Give both tools to `createCodeMode`, and give the returned `tools` array to `chat()`. Because one tool is lazy, `tools` also holds `discover_tools`:

```typescript group=lazy-tools
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";
import { openaiText } from "@tanstack/ai-openai";

const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather, fetchArchive],
});
// tools is [execute_typescript, discover_tools]

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    systemPrompts: ["You are a helpful weather assistant.", systemPrompt],
    tools,
    messages,
    threadId,
    runId,
    agentLoopStrategy: maxIterations(10),
  });

  return toServerSentEventsResponse(stream);
}
```

3. Ask "What was the weather in Paris from 2026-01-01 to 2026-01-07?" The model calls `discover_tools` first, then calls `external_fetchArchive` in `execute_typescript`.

## How it works

The system prompt lists the lazy tools in a "Discoverable APIs" catalog, with names only:

```text
### Discoverable APIs

- external_fetchArchive
- external_runReport
- external_exportData
```

Then the model:

1. Calls `discover_tools` with a list of tool names. The `external_` prefix is optional.
2. Gets the TypeScript type stub and the description of each tool.
3. Writes `execute_typescript` code that calls `external_fetchArchive(...)`.

Lazy hides only the documentation. Every tool is always a function in the sandbox. The model can call `external_fetchArchive` with no discovery, but then it writes the call without the type signature.

## Show descriptions in the catalog

To give the model a hint about each lazy tool before it discovers one, set `lazyToolsConfig.includeDescription`:

```typescript ignore
const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather, fetchArchive],
  lazyToolsConfig: {
    includeDescription: "first-sentence",
  },
});
```

| Value | What the catalog shows |
|-------|------------------------|
| `'none'` (default) | Names only. This is the smallest prompt. |
| `'first-sentence'` | The name and the first sentence of the description. |
| `'full'` | The name and the full description. |

`includeDescription` changes only the catalog. A `discover_tools` call always returns the full type stub.

## Lazy tools with no Code Mode

`chat()` also takes `lazyToolsConfig`, for lazy tools that you give to `chat()` directly. The `includeDescription` values work the same way:

```typescript ignore
const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages,
  tools: [fetchWeather, fetchArchive],
  lazyToolsConfig: { includeDescription: "first-sentence" },
});
```

For the full setup without Code Mode, see [Lazy Tool Discovery](../tools/lazy-tool-discovery).

## Advanced

### What `createCodeMode` returns

| Field | Type | Description |
|-------|------|-------------|
| `tool` | `ServerTool` | The `execute_typescript` tool. |
| `discoveryTool` | `ServerTool \| null` | The `discover_tools` tool, or `null` when no tool is lazy. |
| `tools` | `Array<ServerTool>` | `[tool]`, or `[tool, discoveryTool]`. Give this array to `chat({ tools })`. |
| `systemPrompt` | `string` | The matching system prompt. |

If no tool is lazy, `tools` holds only `execute_typescript`. So you can always pass `tools`, with or without lazy tools.

### `discover_tools` input and output

- **Input:** `{ toolNames: Array<string> }`. Each name can be `fetchArchive` or `external_fetchArchive`.
- **Output:** `{ tools: Array<{ name, description, typeStub }>, errors? }`. An unknown name adds an entry to `errors` that lists the tools that the model can discover.

`discover_tools` is a separate tool call. It is not a function inside `execute_typescript`.

### Tips

- **Start with `'none'`.** Names are enough for models that reason well about tool names. Switch to `'first-sentence'` if the model often discovers the wrong tools.
- **Split by how often a tool is used.** When most requests do not need a tool, make it lazy. Keep the core tools eager.
- **Watch `discover_tools` calls.** `discoveryTool.name` is `"discover_tools"`. Log its calls to see which lazy tools the model needs.
