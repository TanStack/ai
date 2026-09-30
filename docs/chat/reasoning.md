---
title: Reasoning
id: reasoning
order: 6
description: "Set how hard a reasoning model thinks with one reasoning option on chat(), the same on every provider, with per-model type checks."
keywords:
  - tanstack ai
  - reasoning
  - thinking
  - reasoning effort
  - extended thinking
  - thinking budget
---

Every provider has its own switch for reasoning: `reasoning.effort` on OpenAI, `thinking` on Anthropic, `thinkingConfig` on Gemini, `think` on Ollama. The `reasoning` option on `chat()` is one switch for all of them. You pick a level, and the adapter sends what the model needs.

## Set a level

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  reasoning: "high",
});
```

The levels, from least to most thinking, are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Leave `reasoning` out to keep the provider's default.

## The types show the model's levels

Each model has only some of the levels. The types take only the levels of the model you picked:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

chat({
  adapter: anthropicText("claude-opus-4-8"),
  messages: [{ role: "user", content: "Hello" }],
  reasoning: "max",
});

chat({
  adapter: anthropicText("claude-haiku-4-5"),
  messages: [{ role: "user", content: "Hello" }],
  // @ts-expect-error claude-haiku-4-5 has no max level
  reasoning: "max",
});
```

A model that does not reason takes no `reasoning` option at all.

## Hide the thinking text or set a budget

Pass an object for more control:

- `level`: the level.
- `summary`: `false` keeps the thinking text out of the stream. The default is `true`.
- `budgetTokens`: a thinking token budget. Only models that think with a budget take it, such as Claude Haiku 4.5 and Gemini 2.5.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-haiku-4-5"),
  messages: [{ role: "user", content: "Check this proof." }],
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

Without `budgetTokens`, a budget model gets a budget for the level: 1024 tokens for `minimal`, 2048 for `low`, 8192 for `medium`, and 16384 for `high`.

## A level from the user

A level from a settings menu may not be one the model has. The adapter moves it to the nearest level the model has: up first, then down. For example, `minimal` on `claude-opus-4-8` becomes `low`.

To show only the levels a model has, read them from the [model catalog](../models/catalog):

```typescript
import { getModel, supportedReasoningLevels } from "@tanstack/ai-models";

const model = getModel("anthropic", "claude-opus-4-8");
const levels = model ? supportedReasoningLevels(model) : [];
// ["low", "medium", "high", "xhigh", "max"]
```

## Change the level in middleware

Middleware can set the level for a call, for example to lower it on a retry:

```typescript
import type { ChatMiddleware } from "@tanstack/ai";

const lowEffort: ChatMiddleware = {
  name: "low-effort",
  onConfig: () => ({ reasoning: { level: "low", summary: true } }),
};
```

## What each provider receives

| Provider | Sent as |
| --- | --- |
| OpenAI, Grok, Bedrock Responses | `reasoning.effort`, with a summary |
| Anthropic | adaptive thinking with the effort, or a thinking budget |
| Gemini | `thinkingConfig.thinkingLevel` or `thinkingConfig.thinkingBudget` |
| OpenRouter, Vercel AI Gateway | the gateway's `reasoning` object |
| Groq, LLM Gateway, Lovable, Cloudflare, Bedrock chat | `reasoning_effort` |
| Mistral | `reasoning_effort` or `prompt_mode` |
| Ollama | `think` |
| Claude Code, Codex | the CLI effort setting |
| `openaiCompatible` | the model's `thinkingFormat`, see [OpenAI-Compatible](../adapters/openai-compatible#reasoning-models) |

The thinking text streams back as thinking parts. See [Thinking & Reasoning](./thinking-content) to show it in your UI.
