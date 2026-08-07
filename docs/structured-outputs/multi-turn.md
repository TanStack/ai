---
title: Multi-Turn Structured Chat
id: structured-outputs-multi-turn
order: 4
description: "Iterate on a typed object across turns — each assistant turn gets a StructuredOutputPart typed by your schema."
keywords:
  - tanstack ai
  - structured outputs
  - multi-turn
  - structured chat
  - StructuredOutputPart
  - typed message parts
  - UIMessage
  - recipe builder
---

# Multi-Turn Structured Chat

If users iterate on a structured object and you need history → `useChat({ outputSchema })` and walk `messages` (not only `partial` / `final`).

One shot → [One-Shot](./one-shot). Single progressive turn, no history → [Streaming](./streaming). Expo recipe demo: [React Native quick start](../getting-started/quick-start-react-native).

## Message part shape

```typescript
import type { DeepPartial } from "@tanstack/ai";

type StructuredOutputPart<TData> = {
  type: "structured-output";
  status: "streaming" | "complete" | "error";
  partial?: DeepPartial<TData>;
  data?: TData;
  raw: string;
  reasoning?: string;
  errorMessage?: string;
};
```

With `useChat({ outputSchema: RecipeSchema })`, `messages[i].parts` structured-output entries are `StructuredOutputPart<Recipe>`. Each turn is a new assistant message; older cards stay put.

UI imports: framework package or `@tanstack/ai-client` (both generics). Core `@tanstack/ai` types omit the tools generic.

## Server

```typescript
// app/api/structured-chat/route.ts
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

export const RecipeSchema = z.object({
  title: z.string(),
  cuisine: z.string(),
  servings: z.number(),
  estimatedCostUsd: z.number(),
  ingredients: z.array(
    z.object({ item: z.string(), amount: z.string() }),
  ),
  steps: z.array(z.string()),
  tips: z.array(z.string()),
});

export type Recipe = z.infer<typeof RecipeSchema>;

const SYSTEM_PROMPT = `You are a chef assistant. Always respond with a single recipe matching the JSON schema. When the user asks for modifications, produce a new recipe in the same shape that reflects the change.`;

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    systemPrompts: [SYSTEM_PROMPT],
    outputSchema: RecipeSchema,
    stream: true,
  });
  return toServerSentEventsResponse(stream);
}
```

Prior assistant turns round-trip as `raw` JSON content so the model sees previous objects. Streaming/error parts are dropped from the next request.

## Client: walk messages

```tsx ignore
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import type { StructuredOutputPart } from "@tanstack/ai-client";
import { RecipeSchema, type Recipe } from "./api/structured-chat";
import { UserBubble } from "./components";

type RecipePart = StructuredOutputPart<Recipe>;

function StructuredChatPage() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
    outputSchema: RecipeSchema,
    connection: fetchServerSentEvents("/api/structured-chat"),
  });

  return (
    <div>
      {messages.map((m) => {
        if (m.role === "user") {
          const text = m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.content)
            .join("");
          return <UserBubble key={m.id} text={text} />;
        }
        if (m.role === "assistant") {
          const recipePart = m.parts.find(
            (p): p is RecipePart => p.type === "structured-output",
          );
          if (!recipePart) return null;
          return <RecipeCard key={m.id} part={recipePart} />;
        }
        return null;
      })}

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isLoading}
      />
      <button
        onClick={() => {
          sendMessage(input);
          setInput("");
        }}
        disabled={isLoading}
      >
        Send
      </button>
    </div>
  );
}

function RecipeCard({ part }: { part: RecipePart }) {
  const recipe = part.data ?? part.partial;

  return (
    <article>
      <h3>{recipe?.title ?? "Plating up…"}</h3>
      {recipe?.cuisine && <p>{recipe?.cuisine}</p>}
      {recipe?.ingredients?.map((ing, i) => (
        <li key={i}>
          {ing?.amount} {ing?.item}
        </li>
      ))}
      {part.status === "error" && (
        <p>Failed: {part.errorMessage ?? "Stream failed"}</p>
      )}
    </article>
  );
}
```

Polished UI reference: `examples/ts-react-chat/src/routes/generations.structured-chat.tsx`.

## Latest turn sugar

Parts go `streaming` → `complete` (or `error`). Prefer `part.data ?? part.partial`.

Hook `partial` / `final` mirror the **latest** assistant structured-output part — use for sticky summaries; use the messages walk for history.

## Narrow without a named alias

```tsx ignore
const recipePart = m.parts.find(
  (p): p is Extract<typeof p, { type: "structured-output" }> =>
    p.type === "structured-output",
);
// recipePart.data is Recipe | undefined
```

## Round-trip notes

Complete parts serialize as `{ role: "assistant", content: raw }`. Empty `raw` with no serializable `data` drops the turn (fail-quiet). Tools + multi-turn → [With Tools](./with-tools).
