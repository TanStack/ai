---
title: Reasoning
id: reasoning
order: 6
description: "Make a reasoning model think harder, or not at all, with one reasoning option on chat(). The same on every provider, typed per model."
keywords:
  - tanstack ai
  - reasoning
  - thinking
  - reasoning effort
  - extended thinking
  - thinking budget
---

Every provider has its own knob for thinking: `reasoning.effort` on OpenAI, `thinking` on Anthropic, `thinkingConfig` on Gemini, `think` on Ollama. You do not want to learn all of them. Set `reasoning` on `chat()` and the adapter sends the right field for the model.

## Set a level

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    reasoning: "high",
  });

  return toServerSentEventsResponse(stream);
}
```

The levels go from least to most thinking:

`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`

Leave `reasoning` out and the provider default applies.

## Your editor knows the model's levels

Each model has only some of the levels. The types take only the levels of the model you picked:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

chat({
  adapter: anthropicText("claude-opus-5-5"),
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

A model that does not reason takes no `reasoning` at all. Each adapter page lists the levels of its models.

## A level the model does not have

A level can come from a settings menu or from middleware, so the types cannot always catch it. At run time, the adapter moves it to the nearest level that the model has. It looks up first, then down.

For example, `minimal` on `claude-opus-5-5` goes out as `low`, and `max` on `gemini-3.8-flash` goes out as `high`.

## Hide the thinking or set a budget

Pass an object for more control:

- `level`: the level.
- `summary`: `false` keeps the thinking text out of the stream. The default is `true`.
- `budgetTokens`: an exact thinking budget. Only budget models take it, such as Claude Haiku 4.5 and Gemini 2.5 Pro.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Check this proof." }],
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

No `budgetTokens`? A budget model gets a budget from the level: 1024 tokens for `minimal`, 2048 for `low`, 8192 for `medium`, and 16384 for `high` and up.

## Change the level in middleware

Middleware can set the level for one model call. For example, think less when the run retries:

```typescript
import type { ChatMiddleware } from "@tanstack/ai";

const lowEffort: ChatMiddleware = {
  name: "low-effort",
  onConfig: () => ({ reasoning: { level: "low", summary: true } }),
};
```

## Show the thinking on the client

The thinking text arrives as `thinking` parts in `message.parts`, next to the text parts:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const { messages } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return messages.map((message) => (
    <div key={message.id}>
      {message.parts.map((part, index) => {
        if (part.type === "thinking") {
          return (
            <details key={index}>
              <summary>Thinking</summary>
              <pre>{part.content}</pre>
            </details>
          );
        }
        return part.type === "text" ? <p key={index}>{part.content}</p> : null;
      })}
    </div>
  ));
}
```

Some models think without sending any text back. Then the part stays empty. See [Thinking & Reasoning](./thinking-content) for streaming order and signed thinking.

## What each provider gets

| Adapter | Sent as |
| --- | --- |
| OpenAI, Azure OpenAI, Grok, Bedrock Responses | `reasoning: { effort, summary }` |
| OpenAI Chat Completions, Groq, LLM Gateway, Lovable, Bedrock chat, Cloudflare | `reasoning_effort` |
| Anthropic | adaptive thinking with the effort, or a thinking budget |
| Gemini | `thinkingConfig.thinkingLevel` or `thinkingConfig.thinkingBudget` |
| OpenRouter, Vercel AI Gateway | the gateway's `reasoning` object |
| Mistral | `reasoning_effort` or `prompt_mode` |
| BytePlus | `thinking.type` and `reasoning_effort` |
| Ollama | `think` |
| Bedrock Converse | Claude thinking fields |
| Claude Code, Codex, OpenCode | the CLI or server effort setting |

Upgrading from the old `modelOptions` fields? See [Moving reasoning into chat()](../migration/reasoning-option).
