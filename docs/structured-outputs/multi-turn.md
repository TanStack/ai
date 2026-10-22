---
title: Multi-Turn Structured Chat
id: structured-outputs-multi-turn
order: 4
description: "Let users change a typed object over many turns and keep every version on screen. Each run adds an assistant message with its own structured-output part, typed by your schema."
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

Each turn of a structured chat returns the same schema. Earlier objects stay in the thread so the user can compare them.

Each structured run adds a new assistant message with its own typed `structured-output` part. Walk `messages` and render one card per part.

## Quick setup

This setup assumes chat already works in your app and `zod` is installed.

### 1. Define the schema

```typescript
// schemas/recipe.ts
import { z } from "zod";

export const RecipeSchema = z.object({
  title: z.string(),
  cuisine: z.string(),
  servings: z.number(),
  estimatedCostUsd: z.number(),
  ingredients: z.array(z.object({ item: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
  tips: z.array(z.string()),
});
```

### 2. Add the server endpoint

The server sees the full history on each request and returns one structured run:

```typescript
// api/structured-chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { RecipeSchema } from "../schemas/recipe";

const SYSTEM_PROMPT =
  "You are a chef assistant. Always respond with one recipe that matches the JSON schema. When the user asks for a change, return a new recipe in the same shape.";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    systemPrompts: [SYSTEM_PROMPT],
    outputSchema: RecipeSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

### 3. Render one card per turn

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

// The same schema as schemas/recipe.ts. In your app, import it from that file.
const RecipeSchema = z.object({
  title: z.string(),
  cuisine: z.string(),
  servings: z.number(),
  estimatedCostUsd: z.number(),
  ingredients: z.array(z.object({ item: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
  tips: z.array(z.string()),
});

export function RecipeChat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/structured-chat"),
    threadId: "support-chat",
    outputSchema: RecipeSchema,
  });

  return (
    <div>
      {messages.map((m) => {
        if (m.role === "user") {
          const text = m.parts
            .map((p) => (p.type === "text" ? p.content : ""))
            .join("");
          return <p key={m.id}>You: {text}</p>;
        }

        const part = m.parts.find(
          (p): p is Extract<typeof p, { type: "structured-output" }> =>
            p.type === "structured-output",
        );
        if (!part) return null;

        // `data` is the full Recipe. `partial` fills in while the JSON streams.
        const recipe = part.status === "complete" ? part.data : part.partial;

        return (
          <article key={m.id}>
            <h3>{recipe?.title ?? "Cooking..."}</h3>
            <ul>
              {recipe?.ingredients?.map((ing, i) => (
                <li key={i}>
                  {ing?.amount} {ing?.item}
                </li>
              ))}
            </ul>
            {part.status === "error" && <p>Failed: {part.errorMessage}</p>}
          </article>
        );
      })}

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isLoading}
      />
      <button
        disabled={isLoading}
        onClick={() => {
          void sendMessage(input);
          setInput("");
        }}
      >
        Send
      </button>
    </div>
  );
}
```

Ask for a pasta recipe, then send "make it vegan". A second card appears under the first. The first card does not change.

## How it works

- Each successful structured run adds a new assistant message with its own `structured-output` part. Old parts stay as they are.
- `part.data` has the type that your schema infers (`Recipe` here). The schema type flows from `useChat({ outputSchema })` into `messages`.
- On the next turn, the client sends the `raw` JSON of each complete part back as assistant content. The model sees its earlier recipes and can change them.
- The hook-level `partial` and `final` still work. They show only the latest turn. Use them for a small "latest recipe" widget, and walk `messages` for the history.

A run can also hold assistant messages with no structured-output part, for example a plain-text message before the JSON. Always find the part by its type.

The example app has a full version of this UI at `examples/ts-react-chat/src/routes/generations.structured-chat.tsx`. For React Native, the Expo example streams the same recipe pattern into native cards. See [Quick Start: React Native](../getting-started/quick-start-react-native).

## Advanced

### The part type

```typescript
import type { DeepPartial } from "@tanstack/ai";

type StructuredOutputPart<TData> = {
  type: "structured-output";
  status: "streaming" | "complete" | "error";
  /** Progressive parse of `raw`. Set while streaming and after complete. */
  partial?: DeepPartial<TData>;
  /** The full object. Set when `status === "complete"`. */
  data?: TData;
  /** The JSON text. This is what the next turn sends to the model. */
  raw: string;
  /** Reasoning tokens from thinking models, when present. */
  reasoning?: string;
  /** Set when `status === "error"`. */
  errorMessage?: string;
};
```

When `status` is `"complete"`, TypeScript knows that `data` is set.

### How the schema type reaches `messages`

`TData` flows from `useChat({ outputSchema })` through `UIMessage<TTools, TData>` and `MessagePart<TTools, TData>` in `@tanstack/ai-client`. The framework hooks use these types. So `messages[i].parts.find(...)` returns `StructuredOutputPart<Recipe>`, with no cast.

You can also import the named type and use it in a predicate:

```tsx ignore
import type { StructuredOutputPart } from "@tanstack/ai-client";
import type { z } from "zod";
import type { RecipeSchema } from "./schemas/recipe";

type RecipePart = StructuredOutputPart<z.infer<typeof RecipeSchema>>;

const part = message.parts.find(
  (p): p is RecipePart => p.type === "structured-output",
);
```

The core `@tanstack/ai` package also has `MessagePart<TData>` and `UIMessage<TData>`, with one generic and no `TTools`. You need these only at the adapter layer. For UI code, use the types from your framework package or from `@tanstack/ai-client`.

### Part states

A part usually goes from `streaming` to `complete`, or from `streaming` to `error`. A `complete` event can also arrive with no streaming deltas before it.

- While the JSON streams, only `partial` and `raw` are set.
- `data` is set only on `complete`.
- Render `part.data ?? part.partial` to fill the card field by field, then show the full object at the end.

Between `sendMessage()` and the first chunk, the latest turn has no structured-output part. The hook-level `partial` is `{}` and `final` is `null` in that time. To show a placeholder, check `isLoading` and whether the last message is from the user.

### What the next turn sends

- Complete parts stay on their UI messages. The client copies `part.raw` into the assistant content that goes to the model.
- The server conversion keeps the structured-output marker. The adapters read the content for the provider.
- Parts that are still streaming, or that failed, stay in the UI but do not go to the model.
- If a complete part has an empty `raw` and the runtime cannot serialize `data`, the part stays in the UI but does not go to the model. This rule stops a blank assistant turn from reaching the model.

### With tools

Each turn can run tools first, then return a structured message. Tool approvals and client tools work the same way. See [With Tools](./with-tools).
