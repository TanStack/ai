---
title: Multi-Turn Structured Chat
id: structured-outputs-multi-turn
order: 4
description: "Build a chat where users iterate on a typed object across multiple turns — each successfully completed structured-output run adds a typed response to message history, and messages[i].parts.find(p => p.type === 'structured-output') is typed by your schema."
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

You want users to iterate on a structured object across turns. "Give me a pasta recipe under $15" → recipe card lands. "Now make it vegan" → a new recipe card lands; the old one stays visible in history. "Add a salad and make it gluten-free" → third card lands; the first two are still there to compare against.

This is the shape of a structured-output chat: each successfully completed structured-output run adds a structured-output assistant message, every old response stays renderable, and the type of `messages[i].parts.find(p => p.type === 'structured-output').data` is your schema's inferred type — not `unknown`.

By the end of this guide you'll have a chat UI that walks `messages` directly, renders one typed card per successfully completed structured-output run, and keeps history across `sendMessage()` calls.

> **Note:** If you only need a single round-trip (one prompt → one object), use [One-Shot Extraction](./one-shot). If you have one turn that streams progressively but no history, use [Streaming UIs](./streaming) — its `partial` / `final` sugar is the right surface. This page is for the case where history matters.

> **React Native recipe app:** The Expo example streams this same multi-turn
> recipe pattern into native cards with an XHR transport selector. See
> [Quick Start: React Native](../getting-started/quick-start-react-native) to
> run it on Expo Go.

## How it lands on the message

When `useChat({ outputSchema })` receives the server's `structured-output.complete` event, the runtime attaches a typed `structured-output` `MessagePart` to the assistant `UIMessage` carrying the structured response. The part looks like this:

```typescript
import type { DeepPartial } from "@tanstack/ai";

type StructuredOutputPart<TData> = {
  type: "structured-output";
  status: "streaming" | "complete" | "error";
  /** Progressive parse of `raw` — populated while streaming and after complete. */
  partial?: DeepPartial<TData>;
  /** Completed typed object — set when `status === "complete"`. */
  data?: TData;
  /** Accumulating JSON text. Round-trip source of truth for the next turn. */
  raw: string;
  /** Optional reasoning tokens surfaced by thinking models. */
  reasoning?: string;
  /** Set when `status === "error"`. */
  errorMessage?: string;
};
```

`TData` flows from `useChat({ outputSchema })` through the framework-package message types (`UIMessage<TTools, TData>` and `MessagePart<TTools, TData>` in `@tanstack/ai-client`, which the React / Vue / Solid / Svelte hooks re-export) down to the structured-output variant. The result: when you call `useChat({ outputSchema: RecipeSchema })`, `messages[i].parts.find(p => p.type === "structured-output")` returns `StructuredOutputPart<Recipe>` — `data` is typed as `Recipe`, `partial` as `DeepPartial<Recipe>`. No manual cast.

> **Note:** The core `@tanstack/ai` package defines `MessagePart<TData>` and `UIMessage<TData>` with a single generic (no `TTools`) — the tools generic lives in `@tanstack/ai-client` and the framework hook packages. If you're building UI, you almost always want to import from your framework package (`@tanstack/ai-react` / `-vue` / `-solid` / `-svelte`) or from `@tanstack/ai-client` — those carry both generics. The core types come into play only if you're working at the adapter layer below the client.

Each new structured response lands on a **new** assistant message with its **own** structured-output part. Earlier responses stay untouched. That's what makes "show history" trivial.

A run may also contain assistant messages without a structured-output part. Native-combined output keeps the structured JSON and its part on one assistant message. On the separate-finalization path, a plain-text assistant message can precede the structured-output assistant message. Find the part by type instead of assuming that every assistant message contains one.

## Server endpoint

The server side is the same as a single-turn streaming endpoint. `chat({ outputSchema, stream: true })` happens to be multi-turn safe out of the box because the server sees the full conversation history on every request and emits one structured-output run per request.

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

Behind the scenes, when the client sends turn N, prior `UIMessage.parts` remain intact in the request. The client also mirrors each completed structured-output part's `raw` JSON into assistant content. Server conversion preserves the structured-output marker while adapters consume the provider-facing content. Multi-turn coherence is preserved without you doing anything special.

## Client: walk the messages

Here's the shape you want. `useChat` exposes `messages` (typed, schema-aware), `sendMessage`, and the hook-level `partial` / `final` sugar for the latest turn. To render history, walk `messages` directly:

```tsx ignore
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import type { StructuredOutputPart } from "@tanstack/ai-client";
import { RecipeSchema, type Recipe } from "./api/structured-chat";
import { UserBubble } from "./components";

// The schema-typed structured-output part. Pulled out so the find()
// predicate below stays readable.
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
          // `data` is typed as `Recipe` because the schema generic flows
          // all the way from useChat through messages[i].parts.
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
  // `data` is `Recipe` once status === 'complete'. `partial` is
  // DeepPartial<Recipe> while the model is still streaming the JSON.
  // Read whichever is freshest — they converge on complete.
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

That's it. The render loop above produces a card per structured response. When the user sends a follow-up, a new structured-output assistant message arrives — the old card stays exactly as it was.

> **See the full pattern in code:** the example app at `examples/ts-react-chat/src/routes/generations.structured-chat.tsx` ships a polished version of this exact recipe-builder UI — empty state, streaming placeholder, cuisine-aware hero banner, ingredients grid, numbered method, chef's tips block. Use it as a reference for visual layout; the data wiring matches what's shown above.

## Streaming the latest turn

Every `structured-output` part transitions through `streaming` → `complete` (or `streaming` → `error`). The `data` field only populates on `complete` — while the model is still emitting JSON, only `partial` and `raw` are filled in. Render against `part.data ?? part.partial` and the UI fills in field by field as bytes arrive, then snaps to the completed typed object on the terminal event.

The hook-level `partial` and `final` are still available. They're derived from the most recent structured-output part after the latest user message — the same part the render loop above already finds. `partial` returns `{}` between `sendMessage()` and the first chunk (because no structured-output part exists yet to derive from), and `final` returns `null` until the latest turn lands its `complete` event. Use them for sticky-summary widgets ("Latest recipe title: …"); use the `messages` walk for the full history view.

## Type-safe access without a named alias

The example above pulls `type RecipePart = StructuredOutputPart<Recipe>` out for readability. If you'd rather not name it, you can narrow inline with `Extract`:

```tsx ignore
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { RecipeSchema, type Recipe } from "./api/structured-chat";

const { messages } = useChat({
  outputSchema: RecipeSchema,
  connection: fetchServerSentEvents("/api/structured-chat"),
});

for (const m of messages) {
  const recipePart = m.parts.find(
    (p): p is Extract<typeof p, { type: "structured-output" }> =>
      p.type === "structured-output",
  );
  // `recipePart` is `StructuredOutputPart<Recipe> | undefined`.
  // `recipePart.data` is `Recipe | undefined`.
}
```

Both forms produce the same typed result. Pick whichever you find more readable.

## What about the round-trip?

When turn N+1 fires, completed structured-output parts remain on their UI messages and are mirrored into provider-facing assistant content using `part.raw`. Streaming and errored parts remain UI state but are excluded from model input.

If `raw` is empty (rare — a terminal-only complete event arrived before any deltas, then the runtime couldn't serialize the `data` either), the part remains in UI state but is excluded from provider-facing content. This avoids sending a blank assistant turn to the model.

> **Combining with tools?** Multi-turn structured chats compose with the agent loop the same way single-turn streams do — each turn runs tools first, then produces a structured-output message. See [With Tools](./with-tools) for tool-approval gating and client-tool invocations inside a structured-chat run.
