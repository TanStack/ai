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

Unsigned thinking stays in the UI. Signed thinking is a `ThinkingPart` with a `signature`. Anthropic extended thinking uses this. The next request sends signed thinking back in the same order as the original response, including around provider-executed tools. The next-turn body puts that signature on spec `encryptedValue` on the `role: "reasoning"` fan-out. Stream events use `REASONING_ENCRYPTED_VALUE`.

## How It Works

Read the `ThinkingPart` in `message.parts`. Thinking content comes from `REASONING_*` events and from `REASONING_ENCRYPTED_VALUE`. `STEP_STARTED` and `STEP_FINISHED` only carry `stepName`.

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
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: anthropicText("claude-sonnet-4-6"),
    messages,
    modelOptions: {
      max_tokens: 32000,
      // budget_tokens must be at least 1024 and below max_tokens
      thinking: { type: "enabled", budget_tokens: 10000 },
    },
  });
  return toServerSentEventsResponse(stream);
}
```

### OpenAI (Reasoning Models)

OpenAI o-series models (o1, o3, o3-mini, o3-pro) perform reasoning automatically. You can control the depth with the `reasoning` option:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();
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
  return toServerSentEventsResponse(stream);
}
```

When `reasoning.summary` is set, the adapter streams reasoning summary text as thinking content. Without it, reasoning tokens are still used internally but may not be surfaced depending on the model.

GPT-5 and later models also support reasoning. Their `reasoning.effort` accepts `"none" | "minimal" | "low" | "medium" | "high"`, and reasoning activates on any non-`none` value:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    modelOptions: {
      reasoning: { effort: "high" },
    },
  });
  return toServerSentEventsResponse(stream);
}
```

## Rendering in React

Thinking parts appear in `message.parts` just like text and tool calls. A common pattern is to render them in a collapsible element so they don't dominate the UI:

```tsx
import type { UIMessage } from "@tanstack/ai-react";

function MessageContent({ message }: { message: UIMessage }) {
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

1. Reasoning starts (`REASONING_START` / `REASONING_MESSAGE_START`). Encrypted blobs use `REASONING_ENCRYPTED_VALUE`.
2. Reasoning tokens stream in (`REASONING_MESSAGE_CONTENT`) and accumulate into `ThinkingPart.content`.
3. `TEXT_MESSAGE_START` starts the visible response.
4. `TEXT_MESSAGE_CONTENT` streams the response text.

`STEP_STARTED` and `STEP_FINISHED` only carry `stepName`. They do not carry thinking text.

If you use `useChat` from `@tanstack/ai-react` (or the Solid/Vue/Svelte equivalents), your `messages` array updates with both thinking and text parts as they arrive.

## Next Steps

- [Streaming](./streaming) -- Connection adapters and stream events
- [Agentic Cycle](./agentic-cycle) -- How thinking interacts with tool-calling loops
- [Anthropic Adapter](../adapters/anthropic) -- Full Anthropic provider options
- [OpenAI Adapter](../adapters/openai) -- Full OpenAI provider options
