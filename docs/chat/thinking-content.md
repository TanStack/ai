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

When a model emits reasoning tokens, the adapter converts them into AG-UI `STEP_STARTED` and `STEP_FINISHED` events. The stream processor accumulates these into a single `ThinkingPart` on the assistant's `UIMessage`:

```typescript
interface ThinkingPart {
  type: "thinking";
  content: string;
}
```

The `ThinkingPart` appears in `UIMessage.parts` alongside `TextPart` and `ToolCallPart` entries. Each `STEP_FINISHED` event carries an incremental `delta` and the full accumulated `content`, so you always have both the latest token and the complete thinking so far.

## Enabling Thinking

How you enable thinking depends on the provider.

### Anthropic (Extended Thinking)

Pass the `thinking` option in `providerOptions`. You must specify `budget_tokens` (minimum 1024):

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-20250514"),
  messages,
  providerOptions: {
    thinking: { type: "enabled", budget_tokens: 10000 },
  },
});
```

For Claude Opus 4.6 and later, you can use adaptive thinking, where the model decides how much to think:

```typescript
const stream = chat({
  adapter: anthropicText("claude-opus-4-6-20250514"),
  messages,
  providerOptions: {
    thinking: { type: "adaptive" },
    effort: "high", // 'max' | 'high' | 'medium' | 'low'
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
  providerOptions: {
    reasoning: {
      effort: "medium", // 'low' | 'medium' | 'high'
      summary: "auto", // 'auto' | 'detailed'
    },
  },
});
```

When `reasoning.summary` is set, the adapter streams reasoning summary text as thinking content. Without it, reasoning tokens are still used internally but may not be surfaced depending on the model.

GPT-5 and later models also support reasoning when you set the `effort` to a non-`none` value:

```typescript
const stream = chat({
  adapter: openaiText("gpt-5"),
  messages,
  providerOptions: {
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

1. `STEP_STARTED` -- marks the beginning of a thinking block
2. `STEP_FINISHED` (repeated) -- each carries a `delta` with the new token and `content` with the full thinking so far
3. `TEXT_MESSAGE_START` -- the model begins its visible response
4. `TEXT_MESSAGE_CONTENT` (repeated) -- the response text streams in

The stream processor handles all of this for you. If you use `useChat` from `@tanstack/ai-react` (or the Solid/Vue/Svelte equivalents), your `messages` array updates automatically with both thinking and text parts as they arrive.

## Next Steps

- [Streaming](./streaming) -- Connection adapters and stream events
- [Agentic Cycle](./agentic-cycle) -- How thinking interacts with tool-calling loops
- [Anthropic Adapter](../adapters/anthropic) -- Full Anthropic provider options
- [OpenAI Adapter](../adapters/openai) -- Full OpenAI provider options
