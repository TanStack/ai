---
title: Lazy Tools
id: lazy-tools
order: 5
description: "Mark tools lazy: true so signatures load on demand via discover_tools — smaller Code Mode prompts."
keywords:
  - tanstack ai
  - code mode
  - lazy tools
  - discover_tools
  - progressive disclosure
  - prompt size
  - tool catalog
---

# Lazy Tools

If a large tool catalog bloats the `execute_typescript` prompt → mark rare tools `lazy: true`. Bindings stay injected; only **docs** are deferred until `discover_tools`.

## 1. Mark tools lazy

```typescript group=lazy-tools
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const fetchWeather = toolDefinition({
  name: "fetchWeather",
  description: "Get current weather for a city",
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), condition: z.string() }),
}).server(async ({ location }) => {
  const res = await fetch(`https://api.weather.example/v1?city=${location}`);
  return res.json();
});

const fetchArchive = toolDefinition({
  name: "fetchArchive",
  description: "Retrieve historical weather archive data for a date range",
  inputSchema: z.object({
    location: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  outputSchema: z.array(
    z.object({ date: z.string(), temperature: z.number() }),
  ),
  lazy: true,
}).server(async ({ location, from, to }) => {
  const res = await fetch(
    `https://api.weather.example/v1/archive?city=${location}&from=${from}&to=${to}`,
  );
  return res.json();
});
```

Eager tools get full type stubs. Lazy tools appear by name only until discovered.

## 2. Server setup

Any lazy tool makes `createCodeMode` return `discover_tools` — spread `tools` into `chat()`:

```typescript group=lazy-tools
// server/route.ts
import { chat, maxIterations, toServerSentEventsStream } from "@tanstack/ai";
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";
import { openaiText } from "@tanstack/ai-openai";

const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather, fetchArchive],
});

// tools = [execute_typescript, discover_tools]

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    systemPrompts: ["You are a helpful weather assistant.", systemPrompt],
    tools: [...tools],
    messages,
    agentLoopStrategy: maxIterations(10),
  });

  return toServerSentEventsStream(stream);
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tool` | `ServerTool` | `execute_typescript` |
| `discoveryTool` | `ServerTool \| null` | `discover_tools` if any lazy |
| `tools` | `Array<ServerTool>` | `[tool]` or `[tool, discoveryTool]` |
| `systemPrompt` | `string` | Matching prompt |

## `discover_tools` flow

1. Model calls `discover_tools` with bare name (no `external_` prefix)
2. Gets TypeScript stub + description
3. Writes `execute_typescript` using `external_fetchArchive(...)`

Discovery is documentation only — bindings always work.

## Catalog detail

Default catalog is bare names:

```text
### Discoverable APIs

- external_fetchArchive
- external_runReport
- external_exportData
```

Add hints with `lazyToolsConfig.includeDescription`:

```typescript
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createNodeIsolateDriver } from "@tanstack/ai-isolate-node";
import {
  fetchWeather,
  fetchArchive,
  runReport,
  exportData,
} from "./tools";

const { tools, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [fetchWeather, fetchArchive, runReport, exportData],
  lazyToolsConfig: {
    includeDescription: "first-sentence", // 'none' | 'first-sentence' | 'full'
  },
});
```

| Value | Effect |
|-------|--------|
| `'none'` (default) | Names only |
| `'first-sentence'` | Name + first sentence of description |
| `'full'` | Name + full description |

Full stubs still return on discovery.

## Lazy tools with plain `chat()`

Same option outside Code Mode:

```typescript
import { chat, maxIterations, toServerSentEventsStream } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { fetchWeather, fetchArchive, runReport } from "./tools";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: [fetchWeather, fetchArchive, runReport],
    lazyToolsConfig: {
      includeDescription: "first-sentence",
    },
    agentLoopStrategy: maxIterations(10),
  });

  return toServerSentEventsStream(stream);
}
```

## Tips

1. Start with `'none'`; add `'first-sentence'` if the model discovers the wrong tools.
2. Lazy tools remain callable without discovery.
3. Log `discoveryTool` for observability.
4. Lazy by **frequency**, not capability — keep core tools eager.

## Next

- [Code Mode](./code-mode) · [Skills](./code-mode-with-skills) · [Isolates](./code-mode-isolates)
