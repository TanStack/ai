# @tanstack/ai-code-mode

Code Mode for TanStack AI — let LLMs write and execute TypeScript in secure sandboxes with typed tool access.

## Overview

Code Mode gives your AI agent an `execute_typescript` tool. Instead of one tool call per action, the LLM writes a small TypeScript program that orchestrates multiple tool calls with loops, conditionals, `Promise.all`, and data transformations — all running in an isolated sandbox.

## Installation

```bash
pnpm add @tanstack/ai-code-mode
```

You also need an isolate driver:

```bash
# Node.js (fastest, uses V8 isolates via isolated-vm)
pnpm add @tanstack/ai-isolate-node

# QuickJS WASM (browser-compatible, no native deps)
pnpm add @tanstack/ai-isolate-quickjs

# Cloudflare Workers (edge execution)
pnpm add @tanstack/ai-isolate-cloudflare
```

## Quick Start

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { z } from 'zod'

// Define tools that the LLM can call from inside the sandbox
const weatherTool = toolDefinition({
  name: 'fetchWeather',
  description: 'Get weather for a city',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), condition: z.string() }),
}).server(async ({ location }) => {
  // Your implementation
  return { temperature: 72, condition: 'sunny' }
})

// Create the execute_typescript tool and system prompt
const { tool, systemPrompt } = createCodeModeToolAndPrompt({
  driver: createNodeIsolateDriver(),
  tools: [weatherTool],
})

const result = await chat({
  adapter: yourAdapter,
  model: 'gpt-4o',
  systemPrompts: [
    'You are a helpful assistant.',
    systemPrompt,
  ],
  tools: [tool],
  messages: [{ role: 'user', content: 'Compare weather in Tokyo, Paris, and NYC' }],
})
```

The LLM will generate code like:

```typescript
const cities = ["Tokyo", "Paris", "NYC"];
const results = await Promise.all(
  cities.map(city => external_fetchWeather({ location: city }))
);
const warmest = results.reduce((prev, curr) =>
  curr.temperature > prev.temperature ? curr : prev
);
return { warmestCity: warmest.location, temperature: warmest.temperature };
```

## API Reference

### `createCodeModeToolAndPrompt(config)`

Creates both the `execute_typescript` tool and its matching system prompt. This is the recommended entry point.

**Config:**
- `driver` — An `IsolateDriver` (Node, QuickJS, or Cloudflare)
- `tools` — Array of `ServerTool` or `ToolDefinition` instances. Exposed as `external_*` functions in the sandbox
- `timeout` — Execution timeout in ms (default: 30000)
- `memoryLimit` — Memory limit in MB (default: 128, Node driver only)
- `getSkillBindings` — Optional async function returning dynamic bindings

### `createCodeModeTool(config)` / `createCodeModeSystemPrompt(config)`

Lower-level functions if you need only the tool or only the prompt. `createCodeModeToolAndPrompt` calls both internally.

### Advanced

These utilities are used internally and exported for custom pipelines:

- **`stripTypeScript(code)`** — Strips TypeScript syntax using esbuild.
- **`toolsToBindings(tools, prefix?)`** — Converts tools to `ToolBinding` records for sandbox injection.
- **`generateTypeStubs(bindings, options?)`** — Generates TypeScript type declarations from tool bindings.

## Driver Selection Guide

| Driver | Best For | Native Deps | Browser | Memory Limit |
|--------|----------|-------------|---------|--------------|
| `@tanstack/ai-isolate-node` | Server-side Node.js apps | Yes (`isolated-vm`) | No | Yes |
| `@tanstack/ai-isolate-quickjs` | Browser, edge, or no-native-dep environments | No (WASM) | Yes | No |
| `@tanstack/ai-isolate-cloudflare` | Cloudflare Workers deployments | No | N/A | N/A |

## Custom Events

Code Mode emits custom events during execution that you can observe via the TanStack AI event system:

| Event | Description |
|-------|-------------|
| `code_mode:execution_started` | Emitted when code execution begins |
| `code_mode:console` | Emitted for each `console.log/error/warn/info` call |
| `code_mode:external_call` | Emitted before each `external_*` function call |
| `code_mode:external_result` | Emitted after a successful `external_*` call |
| `code_mode:external_error` | Emitted when an `external_*` call fails |

## License

MIT
