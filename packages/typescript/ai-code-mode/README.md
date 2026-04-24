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
import { createCodeMode } from '@tanstack/ai-code-mode'
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
const { tool, systemPrompt } = createCodeMode({
  driver: createNodeIsolateDriver(),
  tools: [weatherTool],
})

const result = await chat({
  adapter: yourAdapter,
  model: 'gpt-4o',
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  tools: [tool],
  messages: [
    { role: 'user', content: 'Compare weather in Tokyo, Paris, and NYC' },
  ],
})
```

The LLM will generate code like:

```typescript
const cities = ['Tokyo', 'Paris', 'NYC']
const results = await Promise.all(
  cities.map((city) => external_fetchWeather({ location: city })),
)
const warmest = results.reduce((prev, curr) =>
  curr.temperature > prev.temperature ? curr : prev,
)
return { warmestCity: warmest.location, temperature: warmest.temperature }
```

## API Reference

### `createCodeMode(config)`

Creates both the `execute_typescript` tool and its matching system prompt. This is the recommended entry point.

**Config:**

- `driver` — An `IsolateDriver` (Node, QuickJS, or Cloudflare)
- `tools` — Array of `ServerTool` or `ToolDefinition` instances. Exposed as `external_*` functions in the sandbox
- `timeout` — Execution timeout in ms (default: 30000)
- `memoryLimit` — Memory limit in MB (default: 128, supported by Node and QuickJS drivers)
- `getSkillBindings` — Optional async function returning dynamic bindings

### `createCodeModeTool(config)` / `createCodeModeSystemPrompt(config)`

Lower-level functions if you need only the tool or only the prompt. `createCodeMode` calls both internally.

### Advanced

These utilities are used internally and exported for custom pipelines:

- **`stripTypeScript(code)`** — Strips TypeScript syntax using esbuild.
- **`toolsToBindings(tools, prefix?)`** — Converts tools to `ToolBinding` records for sandbox injection.
- **`generateTypeStubs(bindings, options?)`** — Generates TypeScript type declarations from tool bindings.

## Driver Selection Guide

| Driver                            | Best For                                     | Native Deps         | Browser | Memory Limit |
| --------------------------------- | -------------------------------------------- | ------------------- | ------- | ------------ |
| `@tanstack/ai-isolate-node`       | Server-side Node.js apps                     | Yes (`isolated-vm`) | No      | Yes          |
| `@tanstack/ai-isolate-quickjs`    | Browser, edge, or no-native-dep environments | No (WASM)           | Yes     | Yes          |
| `@tanstack/ai-isolate-cloudflare` | Cloudflare Workers deployments               | No                  | N/A     | N/A          |

## Custom Events

Code Mode emits custom events during execution that you can observe via the TanStack AI event system:

| Event                         | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `code_mode:execution_started` | Emitted when code execution begins                  |
| `code_mode:console`           | Emitted for each `console.log/error/warn/info` call |
| `code_mode:external_call`     | Emitted before each `external_*` function call      |
| `code_mode:external_result`   | Emitted after a successful `external_*` call        |
| `code_mode:external_error`    | Emitted when an `external_*` call fails             |

## Models eval (development)

The benchmark lives in a **separate workspace package** so `@tanstack/ai-code-mode` does not depend on `@tanstack/ai-isolate-node` (avoids an Nx build cycle). See `models-eval/package.json` (`@tanstack/ai-code-mode-models-eval`).

1. `packages/typescript/ai-code-mode/models-eval/pull-models.sh` — pull recommended Ollama models
2. `pnpm --filter @tanstack/ai-code-mode-models-eval eval:capture` — run models and capture raw outputs/telemetry only (no judge LLM call)
3. `pnpm --filter @tanstack/ai-code-mode-models-eval eval:judge` — judge latest captured session from logs (no model rerun)
4. `pnpm --filter @tanstack/ai-code-mode-models-eval eval` — single-pass run+judge (legacy convenience mode)
5. `pnpm --filter @tanstack/ai-code-mode-models-eval eval -- --ollama-only` — only Ollama models from `eval-config.ts`
6. `pnpm --filter @tanstack/ai-code-mode-models-eval eval -- --ollama-only --models qwen3-coder` — one or more model ids (comma-separated)

Judge-phase flags:

- `--judge-latest` judge latest captured session
- `--rejudge` re-run judging even if logs already contain judge fields

The default list omits some small Ollama models that rarely complete code-mode successfully (see comments in `eval-config.ts`). You can still benchmark them with `--models granite4:3b` etc. if pulled locally.

### Model comparison metrics

The models eval now tracks seven decision-oriented metrics plus an overall rating:

- `accuracy` (1-10): numerical/factual correctness vs gold report
- `comprehensiveness` (1-10): whether the response covers everything requested by the user query
- `typescriptQuality` (1-10): quality/readability/type-safety of generated TypeScript
- `codeModeEfficiency` (1-10): how efficiently the model uses code-mode/tooling to reach the answer
- `speedTier` (1-5): relative wall-clock speed against peers in the same category (`local` or `cloud`)
- `tokenEfficiencyTier` (1-5): relative token efficiency against peers in the same category
- `stabilityTier` (1-5): success consistency over the latest 5 logged runs for that model
- `stars` (1-3): weighted rollup score across all metrics

Raw run telemetry also includes compile/runtime failures, redundant schema checks, total tool calls, TTFT, token totals, stability sample size/rate, and per-model logs.

### Methodology

Canonical output is written to `packages/typescript/ai-code-mode/models-eval/results.json` after each capture or judge run.

- Benchmark: single code-mode benchmark prompt over the in-memory `customers` / `products` / `purchases` dataset
- Primary quality scores (judge): `accuracy`, `comprehensiveness`, `typescriptQuality`, `codeModeEfficiency`
- Computed comparative scores: `speedTier`, `tokenEfficiencyTier`, `stabilityTier`
- Stability definition: a run is "stable" if it has no top-level run error, produces a non-empty candidate report, and has at least one successful `execute_typescript` call
- Star rollup weights:
  - accuracy: 25%
  - comprehensiveness: 15%
  - typescriptQuality: 15%
  - codeModeEfficiency (with compile/runtime failure penalty): 10%
  - speedTier: 10%
  - tokenEfficiencyTier: 10%
  - stabilityTier: 15%

### Model comparison table

The table below is transcribed from canonical `models-eval/results.json` (session `2026-03-26T15:38:44.006Z`).

| Provider  | Model                         | Category | Stars | Accuracy | Comprehensiveness | TypeScript | Code-Mode | Speed Tier | Token Tier | Stability Tier |
| --------- | ----------------------------- | -------- | ----- | -------- | ----------------- | ---------- | --------- | ---------- | ---------- | -------------- |
| Ollama    | `gpt-oss:20b`                 | local    | ★★★   | 10       | 8                 | 5          | 5         | 5          | 5          | 5              |
| Ollama    | `nemotron-cascade-2`          | local    | ★★☆   | 3        | 5                 | 6          | 5         | 1          | 5          | 5              |
| Anthropic | `claude-haiku-4-5`            | cloud    | ★★★   | 10       | 10                | 6          | 7         | 3          | 2          | 5              |
| OpenAI    | `gpt-4o-mini`                 | cloud    | ★★★   | 10       | 8                 | 7          | 9         | 3          | 1          | 5              |
| Gemini    | `gemini-2.5-flash`            | cloud    | ★★★   | 10       | 8                 | 7          | 10        | 4          | 2          | 5              |
| xAI       | `grok-4-1-fast-non-reasoning` | cloud    | ★★★   | 10       | 8                 | 6          | 10        | 4          | 5          | 5              |
| Groq      | `llama-3.3-70b-versatile`     | cloud    | ★★★   | 10       | 7                 | 6          | 9         | 5          | 3          | 4              |
| Groq      | `qwen/qwen3-32b`              | cloud    | ★★☆   | 10       | 8                 | 5          | 4         | 1          | 2          | 5              |

Suggested interpretation:

- **Local-first**: favor `stars >= 2` with high speed tier.
- **Cloud-first quality**: favor high `accuracy` + `typescriptQuality`, then compare stars.
- **Cost-sensitive**: prioritize `tokenEfficiencyTier` and `speedTier` together.

## License

MIT
