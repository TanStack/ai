---
title: Moving reasoning into chat()
description: "Move provider reasoning and thinking fields out of modelOptions and into the reasoning option on chat(), adapter by adapter."
keywords:
  - tanstack ai
  - migration
  - reasoning
  - thinking
  - modelOptions
---

Your `modelOptions` has a reasoning field, like `reasoning: { effort }`, `thinking`, or `thinkingConfig`, and now it does not type-check. That field moved to one option on `chat()`: `reasoning`. It takes a level (`off` to `max`) or `{ level, summary, budgetTokens }`.

## Move it

1. Delete the reasoning field from `modelOptions`.
2. Set `reasoning` on `chat()`.

```typescript ignore
// Before
chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages,
  modelOptions: { reasoning: { effort: "high", summary: "auto" } },
});
```

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const messages = [{ role: "user" as const, content: "Hello" }];

// After
chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages,
  reasoning: "high",
});
```

The thinking text streams by default. Want it hidden? Pass `reasoning: { level: "high", summary: false }`.

## Adapter by adapter

| Adapter | Old `modelOptions` field | Now |
| --- | --- | --- |
| `openaiText`, `openaiChatCompletions`, `azureOpenaiText` | `reasoning: { effort, summary }` | `reasoning: "high"` |
| `anthropicText` | `thinking`, `effort`, `output_config.effort` | `reasoning: "high"`, or `{ level, budgetTokens }` on budget models |
| `geminiText` | `thinkingConfig` | `reasoning: "high"`, or `{ level, budgetTokens }` on Gemini 2.5 |
| `geminiTextInteractions` | `generation_config.thinking_level`, `thinking_summaries` | `reasoning: "high"` |
| `grokText`, `openRouterText` | `reasoning: { effort }` | `reasoning: "high"` |
| `vercelGatewayText`, `lovableText` | `reasoning`, `include_reasoning` | `reasoning: "high"` |
| `bedrockText` | `reasoning_effort` (chat), `reasoning` (Responses) | `reasoning: "high"` |
| `groqText`, `llmGatewayText`, `cloudflareText` | `reasoning_effort` | `reasoning: "high"` |
| `byteplusText` | `thinking`, `reasoning_effort` | `reasoning: "high"`, or `"off"` |
| `ollamaText` | `think` | `reasoning: "high"`, or `"off"` |
| `codexText` | `modelReasoningEffort` | `reasoning: "high"` |

`"high"` is an example. Use any level that your model has. The types show which ones.

## Budgets

An Anthropic or Gemini 2.5 budget moves to `budgetTokens`:

```typescript ignore
// Before
modelOptions: { thinking: { type: "enabled", budget_tokens: 8000 } }
```

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const messages = [{ role: "user" as const, content: "Hello" }];

// After
chat({
  adapter: anthropicText("claude-haiku-4-5"),
  messages,
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

The adapter raises `max_tokens` when it is below the budget.

## Azure

`azureOpenaiText` and `createAzureOpenaiText` read the levels of the OpenAI model name that you pass, not of your deployment name:

```typescript
import { chat } from "@tanstack/ai";
import { createAzureOpenaiText } from "@tanstack/ai-openai";

const messages = [{ role: "user" as const, content: "Hello" }];

chat({
  adapter: createAzureOpenaiText("gpt-6.1-sol", "azure-key", {
    resourceName: "my-resource",
    deploymentName: "prod-chat",
  }),
  messages,
  reasoning: "high",
});
```

Pass only a deployment name as the model, and the adapter has no levels for it. Then `reasoning` is a type error. Pass the OpenAI model name and set `deploymentName`.

## Codex

`modelReasoningEffort` stays on the `codexText` config. It is the default for a call without `reasoning`.

## Removed types

- `@tanstack/ai-openai`: `OpenAIReasoningOptions`, `OpenAIReasoningOptionsWithConcise`.
- `@tanstack/ai-anthropic`: `AnthropicThinkingOptions`, `AnthropicAdaptiveThinkingOptions`, `AnthropicAdaptiveOnlyThinkingOptions`, `AnthropicAdaptiveOrDisabledThinkingOptions`, `AnthropicEffortOptions`, `AnthropicOutputConfigOptions`.
- `@tanstack/ai-gemini`: `GeminiThinkingOptions`.
- `@tanstack/ai-grok`: `GrokReasoning`, `GrokReasoningEffort`, `GrokBuildProviderOptions`.
- `@tanstack/ai-openrouter`: `ReasoningOptions`. `@tanstack/ai-byteplus`: `BytePlusThinkingOption`, `BytePlusReasoningEffort`.

Done. Your reasoning now works the same on every provider. See [Reasoning](../chat/reasoning) for levels, budgets, and middleware.
