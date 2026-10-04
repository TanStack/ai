---
title: Moving Reasoning into chat({ reasoning })
description: "Move provider reasoning and thinking settings out of modelOptions and into the reasoning option on chat()."
keywords:
  - tanstack ai
  - migration
  - reasoning
  - thinking
  - modelOptions
---

> **TL;DR:** This is a **breaking change**. Reasoning and thinking settings are no longer in `modelOptions`. Set them with the `reasoning` option on `chat()`. It takes a level, `off` to `max`, or `{ level, summary, budgetTokens }`.

## Move your code

Find the reasoning field in your `modelOptions`, delete it, and set `reasoning` on `chat()`:

```typescript ignore
// Before
chat({
  adapter: openaiText("gpt-5.5"),
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
  adapter: openaiText("gpt-5.5"),
  messages,
  reasoning: "high",
});
```

The summary is on by default. Pass `reasoning: { level: "high", summary: false }` to turn it off.

## The old fields, by provider

| Provider | Old `modelOptions` field | Now |
| --- | --- | --- |
| OpenAI | `reasoning: { effort, summary }` | `reasoning: "high"` |
| Anthropic | `thinking`, `effort`, `output_config.effort` | `reasoning: "high"`, or `{ level, budgetTokens }` on budget models |
| Gemini | `thinkingConfig` | `reasoning: "high"`, or `{ level, budgetTokens }` on Gemini 2.5 |
| Gemini Interactions | `generation_config.thinking_level` | `reasoning: "high"` |
| Grok, OpenRouter | `reasoning: { effort }` | `reasoning: "high"` |
| Vercel AI Gateway, Lovable | `reasoning`, `include_reasoning` | `reasoning: "high"` |
| Bedrock | `reasoning_effort`, `reasoning` | `reasoning: "high"` |
| Groq, LLM Gateway, Cloudflare | `reasoning_effort` | `reasoning: "high"` |
| BytePlus | `thinking`, `reasoning_effort` | `reasoning: "high"`, or `"off"` |
| Ollama | `think` | `reasoning: "high"`, or `"off"` |
| Codex | `modelReasoningEffort` | `reasoning: "high"` |

For Anthropic budget thinking, the budget moves to `budgetTokens`:

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

## Removed types

These types described the old fields and are gone:

- `@tanstack/ai-openai`: `OpenAIReasoningOptions`, `OpenAIReasoningOptionsWithConcise`.
- `@tanstack/ai-anthropic`: `AnthropicThinkingOptions` and the adaptive, effort, and output-config thinking option types.
- `@tanstack/ai-gemini`: `GeminiThinkingOptions`.
- `@tanstack/ai-grok`: `GrokReasoning`, `GrokReasoningEffort`.
- `@tanstack/ai-openrouter`: `ReasoningOptions`. `@tanstack/ai-byteplus`: `BytePlusThinkingOption`, `BytePlusReasoningEffort`.

See [Reasoning](../chat/reasoning) for the levels and what each provider receives.
