---
title: Lazy Tools
id: lazy-tools
order: 5
description: "Keep large tool catalogs out of the Code Mode system prompt with lazy tools — the model fetches TypeScript signatures on demand via a discover_tools call."
keywords:
  - tanstack ai
  - code mode
  - lazy tools
  - discover_tools
  - progressive disclosure
  - prompt size
  - tool catalog
---

Large tool catalogs bloat the `execute_typescript` system prompt. Every tool you pass to `createCodeMode` becomes a full TypeScript type stub in that prompt — and at 50+ tools, those stubs can push the effective prompt into the tens of thousands of tokens before the model has even seen your user message.

Lazy tools fix this with **progressive disclosure**: mark rarely-used tools `lazy: true` and they are withheld from the initial system prompt. The model sees only their names in a short "Discoverable APIs" catalog. When it needs one, it calls the `discover_tools` sibling tool to fetch the TypeScript signature on demand, then uses it inside `execute_typescript`. All sandbox bindings are always injected — lazy only defers _documentation_, not callability.

## Marking a Tool Lazy

Add `lazy: true` to the `toolDefinition` config for any tool you want to defer:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// Always eager — documented upfront
const fetchWeather = toolDefinition({
  name: "fetchWeather",
  description: "Get current weather for a city",
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), condition: z.string() }),
}).server(async ({ location }) => {
  const res = await fetch(`https://api.weather.example/v1?city=${location}`);
  return res.json();
});

// Lazy — kept out of the system prompt until discovered
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
}).server(async ({ location, from, to }) => {
  const res = await fetch(
    `https://api.weather.example/v1/archive?city=${location}&from=${from}&to=${to}`
  );
  return res.json();
});
```

Eager tools continue to receive full type stubs in the system prompt. Lazy tools appear only by name.

## Server Setup

Pass both eager and lazy tools to `createCodeMode`. When at least one tool is lazy, `createCodeMode` also returns a `discover_tools` sibling tool — include it in the `tools` array you pass to `chat()`:

```typescript
// server/route.ts
import { chat, maxIterations, toServerSentEventsStream } from "@tanstack/ai";
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";
import { openaiText } from "@tanstack/ai-openai";

const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather, fetchArchive], // fetchArchive is lazy
});

// tools is [execute_typescript, discover_tools]
// — discover_tools is included automatically because fetchArchive is lazy

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    systemPrompts: ["You are a helpful weather assistant.", systemPrompt],
    tools: [...tools],
    messages,
    agentLoopStrategy: maxIterations(10),
  });

  return toServerSentEventsStream(stream);
}
```

`createCodeMode` returns `{ tool, discoveryTool, tools, systemPrompt }`:

| Field | Type | Description |
|-------|------|-------------|
| `tool` | `ServerTool` | The `execute_typescript` tool (backward compatible) |
| `discoveryTool` | `ServerTool \| null` | The `discover_tools` tool, or `null` when there are no lazy tools |
| `tools` | `Array<ServerTool>` | `[tool]` or `[tool, discoveryTool]` — spread into `chat({ tools })` |
| `systemPrompt` | `string` | The matching system prompt |

If no tools are lazy, `discoveryTool` is `null` and `tools` contains only `execute_typescript`.

## The `discover_tools` Flow

When the model encounters a task that requires a lazy tool, it:

1. Calls `discover_tools` with the tool name (bare name, no `external_` prefix).
2. Receives the TypeScript type stub and description for that tool.
3. Writes `execute_typescript` code using the now-documented `external_fetchArchive(...)` call.

The bindings are always injected into the sandbox — discovering a tool only retrieves documentation, it does not enable the binding. The model could call `external_fetchArchive` without discovering it first, but it would be writing blind without the type signature.

## Tuning the Discoverable APIs Catalog

By default, lazy tools appear in the system prompt as bare names with no description:

```
### Discoverable APIs

- external_fetchArchive
- external_runReport
- external_exportData
```

If you want the model to have a hint about what each tool does before deciding whether to discover it, use `lazyToolsConfig.includeDescription`:

```typescript
const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather, fetchArchive, runReport, exportData],
  lazyToolsConfig: {
    includeDescription: "first-sentence", // 'none' | 'first-sentence' | 'full'
  },
});
```

With `'first-sentence'` the catalog becomes:

```
### Discoverable APIs

- external_fetchArchive — Retrieve historical weather archive data for a date range.
- external_runReport — Generate a summary report for a given time period.
- external_exportData — Export query results to CSV or JSON format.
```

| Value | Effect |
|-------|--------|
| `'none'` (default) | Bare names only — smallest possible prompt addition |
| `'first-sentence'` | Name plus the first sentence of the tool's description |
| `'full'` | Name plus the complete description |

The full type stub and input/output schema are always returned on discovery — `includeDescription` only affects the pre-discovery catalog.

## Lazy Tools with Plain `chat()`

The same `lazyToolsConfig` option works for lazy tools used directly with `chat()`, outside of Code Mode. Tools marked `lazy: true` are withheld from the `__lazy__tool__discovery__` catalog description until the model calls for them. Pass `lazyToolsConfig` directly to `chat()`:

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// Non-code-mode: lazy tools in a regular chat agent
const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages,
  tools: [fetchWeather, fetchArchive, runReport],
  lazyToolsConfig: {
    includeDescription: "first-sentence",
  },
  agentLoopStrategy: maxIterations(10),
});
```

The `includeDescription` behavior is identical — `'none'` lists bare tool names, `'first-sentence'` appends the first sentence, `'full'` appends the complete description.

## Tips

- **Start with `'none'`.** The bare-names catalog is enough for models that reason well about tool names. Add `'first-sentence'` only if the model frequently discovers irrelevant tools.
- **Lazy tools are always callable.** Their `external_*` bindings are injected into the sandbox regardless of whether the model has called `discover_tools`. Discovery only reveals documentation.
- **Use `discoveryTool` for observability.** You can inspect `discoveryTool.name` (`"discover_tools"`) to confirm the tool is wired up, or log its calls for analytics.
- **Partition by frequency, not capability.** Mark tools lazy when they are rarely needed for a typical request. Core tools that most requests use should stay eager.

## Next Steps

- [Code Mode](./code-mode) — Core Code Mode setup and API reference
- [Code Mode with Skills](./code-mode-with-skills) — Persistent reusable skill libraries
- [Isolate Drivers](./code-mode-isolates) — Compare Node, QuickJS, and Cloudflare sandbox runtimes
