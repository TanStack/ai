---
title: Thinking & Reasoning
id: thinking-content
order: 5
description: "Stream and render ThinkingPart from Claude extended thinking and OpenAI reasoning models."
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

If the model exposes reasoning tokens → read `ThinkingPart` on `message.parts`. It is **UI-only** (never sent back to the model).

## Shape

Adapters emit `REASONING_MESSAGE_*` (canonical) and legacy `STEP_*` events. The stream processor merges both into one `ThinkingPart` — use that, not raw events:

```typescript
interface ThinkingPart {
  type: "thinking";
  content: string;
  stepId?: string;
  signature?: string;
}
```

## Enable thinking

### Anthropic (extended thinking)

`budget_tokens` ≥ 1024 and **below** `max_tokens`:

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
      thinking: { type: "enabled", budget_tokens: 10000 },
    },
  });
  return toServerSentEventsResponse(stream);
}
```

### OpenAI (reasoning models)

o-series reasons automatically. Control depth with `reasoning`:

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

With `reasoning.summary` set, summary text streams as thinking. Without it, reasoning may stay internal.

GPT-5+ also supports reasoning — any non-`none` effort activates it:

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

## Render in React

Collapse thinking so it does not dominate the UI:

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

Inline italic pattern: [Quick Start](../getting-started/quick-start).

## Streaming order

Thinking accumulates **before** visible text:

1. Reasoning block starts (`REASONING_MESSAGE_START` + legacy `STEP_STARTED`)
2. Tokens stream (`REASONING_MESSAGE_CONTENT` + legacy `STEP_FINISHED`) → `ThinkingPart.content`
3. `TEXT_MESSAGE_START` — visible response begins
4. `TEXT_MESSAGE_CONTENT` — text streams

`useChat` (and Solid/Vue/Svelte hooks) update `messages` automatically.

## Next

- [Streaming](./streaming)
- [Agentic Cycle](./agentic-cycle)
- [Anthropic Adapter](../adapters/anthropic)
- [OpenAI Adapter](../adapters/openai)
