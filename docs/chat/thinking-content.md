---
title: Thinking & Reasoning
id: thinking-content
order: 5
description: "Render reasoning tokens from thinking models (Claude extended thinking, OpenAI o-series) as streamed ThinkingPart in TanStack AI chat UIs."
keywords:
  - tanstack ai
  - thinking
  - reasoning
  - extended thinking
  - claude thinking
  - o-series
  - chain of thought
  - ThinkingPart
---

Some models expose their internal reasoning as "thinking" content -- Claude with extended thinking, OpenAI o-series models with reasoning, and others. TanStack AI captures this as `ThinkingPart` in messages, streamed to your UI in real-time alongside text and tool calls.

Thinking content is **UI-only**. It is never sent back to the model in subsequent requests.

## How It Works

When a model emits reasoning tokens, the adapter emits AG-UI events for them. Adapters emit `REASONING_MESSAGE_*` events (the preferred, canonical form) **and** the older `STEP_STARTED` / `STEP_FINISHED` events. The stream processor reconciles both into a single `ThinkingPart` on the assistant's `UIMessage`, deduplicating overlapping content. You should rely on the `ThinkingPart` in `message.parts` rather than hand-parsing the raw events:

```typescript
interface ThinkingPart {
  type: "thinking";
  content: string;
  stepId?: string;
  signature?: string;
}
```

The `ThinkingPart` appears in `UIMessage.parts` alongside `TextPart` and `ToolCallPart` entries. As reasoning tokens arrive, its `content` accumulates token by token.

## Enabling Thinking

How you enable thinking depends on the provider.

### Anthropic (Extended Thinking)

Pass the `thinking` option in `modelOptions` with `type: "enabled"` and a `budget_tokens` (minimum 1024). Keep `budget_tokens` below `modelOptions.max_tokens` so there is room for the visible response in addition to the thinking budget:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages,
  modelOptions: {
    max_tokens: 32000,
    // budget_tokens must be at least 1024 and below max_tokens
    thinking: { type: "enabled", budget_tokens: 10000 },
  },
});
```

### OpenAI (Reasoning Models)

OpenAI o-series models (o1, o3, o3-mini, o3-pro) perform reasoning automatically. You can control the depth with the `reasoning` option:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("o3-mini"),
  messages,
  modelOptions: {
    reasoning: {
      effort: "medium", // 'none' | 'minimal' | 'low' | 'medium' | 'high'
      summary: "auto", // 'auto' | 'detailed'
    },
  },
});
```

When `reasoning.summary` is set, the adapter streams reasoning summary text as thinking content. Without it, reasoning tokens are still used internally but may not be surfaced depending on the model.

GPT-5 and later models also support reasoning. Their `reasoning.effort` accepts `"none" | "minimal" | "low" | "medium" | "high"`, and reasoning activates on any non-`none` value:

```typescript
const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  modelOptions: {
    reasoning: { effort: "high" },
  },
});
```

## Rendering in React

Thinking parts appear in `message.parts` just like text and tool calls. A common pattern is to render them in a collapsible element so they don't dominate the UI:

```tsx
function MessageContent({ message }) {
  return (
    <div>
      {message.parts.map((part, idx) => {
        if (part.type === "thinking") {
          return (
            <details key={idx}>
              <summary>Thinking...</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{part.content}</pre>
            </details>
          );
        }
        if (part.type === "text") {
          return <p key={idx}>{part.content}</p>;
        }
        return null;
      })}
    </div>
  );
}
```

The [Quick Start](../getting-started/quick-start) guide shows a simpler inline pattern where thinking is rendered as italic text above the response.

## Streaming Behavior

Thinking content streams **before** the final text response. As reasoning tokens arrive, `ThinkingPart.content` accumulates token by token, the same way `TextPart.content` does for the response text.

The typical streaming order is:

1. The reasoning block begins (`REASONING_MESSAGE_START`, plus a legacy `STEP_STARTED`)
2. Reasoning tokens stream in (`REASONING_MESSAGE_CONTENT`, plus legacy `STEP_FINISHED` events), accumulating into `ThinkingPart.content`
3. `TEXT_MESSAGE_START` -- the model begins its visible response
4. `TEXT_MESSAGE_CONTENT` (repeated) -- the response text streams in

Adapters emit both the canonical `REASONING_MESSAGE_*` events and the older `STEP_*` events; the stream processor reconciles them into one `ThinkingPart` so you never have to hand-parse the raw events. If you use `useChat` from `@tanstack/ai-react` (or the Solid/Vue/Svelte equivalents), your `messages` array updates automatically with both thinking and text parts as they arrive.

## Next Steps

- [Streaming](./streaming) -- Connection adapters and stream events
- [Agentic Cycle](./agentic-cycle) -- How thinking interacts with tool-calling loops
- [Anthropic Adapter](../adapters/anthropic) -- Full Anthropic provider options
- [OpenAI Adapter](../adapters/openai) -- Full OpenAI provider options
