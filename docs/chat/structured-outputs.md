---
title: Structured Outputs
id: structured-outputs
order: 4
description: "Constrain TanStack AI responses to a JSON Schema for typed, predictable structured output using Zod, Valibot, or any Standard Schema library."
keywords:
  - tanstack ai
  - structured outputs
  - json schema
  - zod
  - valibot
  - standard schema
  - type-safe llm
  - outputSchema
---

Structured outputs allow you to constrain AI model responses to match a specific JSON schema, ensuring consistent and type-safe data extraction. TanStack AI uses the [Standard JSON Schema](https://standardschema.dev/) specification, allowing you to use any compatible schema library.

## Overview

When you provide an `outputSchema` to the `chat()` function, TanStack AI:

1. Converts your schema to JSON Schema format
2. Sends it to the provider's native structured output API
3. Validates the response against your schema
4. Returns a fully typed result

This is useful for:

- **Extracting structured data** from unstructured text
- **Building forms or wizards** with AI-generated content
- **Creating APIs** that return predictable JSON shapes
- **Ensuring type safety** between AI responses and your application

## Schema Libraries

TanStack AI uses **Standard JSON Schema**, which means you can use any schema library that implements the specification:

- [Zod](https://zod.dev/) (v4.2+)
- [ArkType](https://arktype.io/)
- [Valibot](https://valibot.dev/) (via `@valibot/to-json-schema`)
- Plain JSON Schema objects

> **Note:** Refer to your schema library's documentation for details on defining schemas and using features like `.meta()` for field descriptions. TanStack AI will convert your schema to JSON Schema format automatically.

## Basic Usage

Here's how to use structured outputs with a Zod schema:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

// Define your schema
const PersonSchema = z.object({
  name: z.string().meta({ description: "The person's full name" }),
  age: z.number().meta({ description: "The person's age in years" }),
  email: z.string().email().meta({ description: "The person's email address" }),
});

// Use it with chat()
const person = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [
    {
      role: "user",
      content: "Extract the person info: John Doe is 30 years old, email john@example.com",
    },
  ],
  outputSchema: PersonSchema,
});

// person is fully typed as { name: string, age: number, email: string }
console.log(person.name); // "John Doe"
console.log(person.age); // 30
console.log(person.email); // "john@example.com"
```

## Type Inference

The return type of `chat()` changes based on the `outputSchema` prop:

| Configuration | Return Type |
|--------------|-------------|
| No `outputSchema` | `AsyncIterable<StreamChunk>` |
| With `outputSchema` | `Promise<InferSchemaType<TSchema>>` |
| With `outputSchema` and `stream: true` | `StructuredOutputStream<InferSchemaType<TSchema>>` |

When you provide an `outputSchema`, TanStack AI automatically infers the TypeScript type from your schema:

```typescript
import { z } from "zod";

// Define a complex schema
const RecipeSchema = z.object({
  name: z.string(),
  prepTime: z.string(),
  servings: z.number(),
  ingredients: z.array(
    z.object({
      item: z.string(),
      amount: z.string(),
    })
  ),
  instructions: z.array(z.string()),
});

// TypeScript knows the exact return type
const recipe = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Give me a recipe for scrambled eggs" }],
  outputSchema: RecipeSchema,
});

// Full type safety - TypeScript knows all these properties exist
recipe.name; // string
recipe.prepTime; // string
recipe.servings; // number
recipe.ingredients[0].item; // string
recipe.instructions.map((step) => step.toUpperCase()); // string[]
```

## Using Field Descriptions

Schema field descriptions help the AI understand what data to extract. In Zod 4+, use the `.meta()` method:

```typescript
const ProductSchema = z.object({
  name: z.string().meta({ description: "The product name" }),
  price: z.number().meta({ description: "Price in USD" }),
  inStock: z.boolean().meta({ description: "Whether the product is currently available" }),
  categories: z
    .array(z.string())
    .meta({ description: "Product categories like 'electronics', 'clothing', etc." }),
});
```

These descriptions are included in the JSON Schema sent to the provider, giving the AI context about each field.

## Complex Nested Schemas

You can define deeply nested structures:

```typescript
const CompanySchema = z.object({
  name: z.string(),
  founded: z.number().meta({ description: "Year the company was founded" }),
  headquarters: z.object({
    city: z.string(),
    country: z.string(),
    address: z.string().optional(),
  }),
  employees: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      department: z.string(),
    })
  ),
  financials: z
    .object({
      revenue: z.number().meta({ description: "Annual revenue in millions USD" }),
      profitable: z.boolean(),
    })
    .optional(),
});

const company = await chat({
  adapter: anthropicText("claude-sonnet-4-5"),
  messages: [
    {
      role: "user",
      content: "Extract company info from this article: ...",
    },
  ],
  outputSchema: CompanySchema,
});

// Access nested properties with full type safety
console.log(company.headquarters.city);
console.log(company.employees[0].role);
```

## Streaming Structured Output

Pass `stream: true` alongside `outputSchema` to receive incremental JSON deltas while the model is generating, plus a final validated, typed object. This is the path to take when you want a progressive UI — a streaming form, a typewriter-style preview, partial cards filling in field by field — instead of a single blocking await.

You build it in two halves: a server route that runs `chat({ outputSchema, stream: true })` and pipes the result as Server-Sent Events, and a client that wires `useChat` to that endpoint and updates state as chunks arrive. The same flow as regular streaming chat (see [Streaming](./streaming)) — `outputSchema + stream: true` just adds one terminal event with the validated object.

### Server endpoint

```typescript
// app/api/extract-person/route.ts (or your framework's equivalent)
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string().meta({ description: "The person's full name" }),
  age: z.number().meta({ description: "The person's age in years" }),
  email: z.string().email(),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
    outputSchema: PersonSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

That's the entire server side. `chat({ outputSchema, stream: true })` returns a `StructuredOutputStream<InferSchemaType<typeof PersonSchema>>` — the same kind of `AsyncIterable` that `toServerSentEventsResponse` accepts for any streaming chat endpoint. The schema travels in the request as JSON Schema, validation runs server-side after the stream completes, and the validated object is emitted as the terminal `structured-output.complete` event.

### Client with `useChat`

Pass the same schema to `useChat` and the hook tracks the progressive object and the validated terminal object for you — `partial` updates as JSON streams in, `final` snaps when `structured-output.complete` arrives. No external state, no `onChunk` ceremony, no `parsePartialJSON` calls:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

function PersonExtractor() {
  const { sendMessage, isLoading, partial, final } = useChat({
    connection: fetchServerSentEvents("/api/extract-person"),
    outputSchema: PersonSchema,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendMessage("Extract: John Doe, 30, john@example.com");
      }}
    >
      <button disabled={isLoading}>Extract</button>
      {/* `partial` fills in field by field as JSON streams in. */}
      <p>Name: {partial.name ?? "…"}</p>
      <p>Age: {partial.age ?? "…"}</p>
      <p>Email: {partial.email ?? "…"}</p>
      {final && <pre>Validated: {JSON.stringify(final, null, 2)}</pre>}
    </form>
  );
}
```

What the hook does for you:

- **`partial`** is `DeepPartial<z.infer<typeof PersonSchema>>` — every property optional, every nested array element optional. Updated from `TEXT_MESSAGE_CONTENT` deltas via `parsePartialJSON`. Resets on every new `sendMessage` / `reload`.
- **`final`** is `z.infer<typeof PersonSchema> | null` — the validated terminal payload from the `structured-output.complete` event. `null` until the run completes successfully.
- **`outputSchema`** is used purely for client-side **type inference**. Validation still runs on the server against the schema you pass to `chat({ outputSchema })` on the server route.
- This same hook shape works for **non-streaming structured output too**. If your server returns a single `structured-output.complete` event (the fallback path for adapters that don't natively stream), `partial` stays `{}` and `final` populates when the event arrives — same consumer code.

The `outputSchema` field is optional: if you omit it, `useChat`'s return type is unchanged, and `partial` / `final` aren't present.

### Rendering reasoning and tool calls

Reasoning tokens and tool calls aren't on `partial` / `final` — they're already where they'd be in a normal chat: on `messages[…].parts`. The stream processor inside `useChat` routes each chunk type to its canonical part:

| Chunk type | Where it lands |
|---|---|
| `REASONING_MESSAGE_CONTENT` | `ThinkingPart` on the assistant message |
| `TOOL_CALL_START` / `_ARGS` / `_END` | `ToolCallPart` on the assistant message |
| `TOOL_CALL_RESULT` | `ToolResultPart` on the tool message |
| `TEXT_MESSAGE_CONTENT` | `TextPart` on the assistant message (this is the raw JSON when `outputSchema` is set — see below) |

So render reasoning and tool calls the same way you'd render them in a normal chat UI:

```tsx
const last = messages.at(-1);

return (
  <>
    {last?.parts.map((part, i) => {
      if (part.type === "thinking") return <ReasoningView key={i} text={part.text} />;
      if (part.type === "tool-call") return <ToolCallView key={i} part={part} />;
      // Hide raw JSON text — the structured view below replaces it.
      if (part.type === "text") return null;
      return null;
    })}

    <StructuredView data={final ?? partial} />
  </>
);
```

> **Note:** When `outputSchema` is set, the assistant's `TextPart` contains the raw JSON the model produced (e.g. `{"name":"John","age":30,…}`). That's not meant to be shown to end users — the structured view powered by `partial` / `final` replaces it. Filter `text` parts out of your message renderer in this mode, as in the snippet above.

> **Going lower-level?** `useChat` still exposes `onChunk` if you want to observe individual chunks alongside the managed `partial` / `final` state (e.g. to drive a custom progress UI). The two paths compose — internal partial/final tracking always runs first, then your `onChunk` callback fires with the same chunk.

`useChat` (React, Vue, Solid) and `createChat` (Svelte) all accept the same `outputSchema` option and expose `partial` / `final` with the same semantics — only the reactivity primitive differs (React state, Vue `shallowRef`, Solid `Accessor`, Svelte reactive getter). See your framework's quick-start for the local idioms.

### What the stream contains

`chat({ outputSchema, stream: true })` returns a `StructuredOutputStream<T>` — an `AsyncIterable` over the standard `StreamChunk` lifecycle plus a terminal `CUSTOM` event named `structured-output.complete`:

```typescript
{
  type: "CUSTOM",
  name: "structured-output.complete",
  value: {
    object: T;        // validated, parsed, typed
    raw: string;      // full accumulated JSON text
    reasoning?: string; // present only for thinking/reasoning models
  },
  // ...standard event fields (timestamp, model, …)
}
```

### Adapter coverage

Streaming structured output works with **every adapter**, but only some support a true single-request streaming wire format:

| Adapter | Behavior with `outputSchema` + `stream: true` |
|---------|-----------------------------------------------|
| `@tanstack/ai-openai` | Native single-request stream (Responses API, `text.format: json_schema`) |
| `@tanstack/ai-openrouter` | Native single-request stream (`response_format: json_schema`) |
| `@tanstack/ai-grok` | Native single-request stream (Chat Completions, `response_format: json_schema`) |
| `@tanstack/ai-groq` | Native single-request stream (Chat Completions, `response_format: json_schema`) |
| Other adapters (anthropic, gemini, ollama, …) | Fallback: runs non-streaming `structuredOutput` and emits the final object as one `structured-output.complete` event |

The fallback path keeps the consumer code identical across providers — you always read the final object off `structured-output.complete` — but you won't see incremental deltas unless the adapter implements `structuredOutputStream` natively.

### Advanced: iterating the stream directly

When you don't need the SSE-over-HTTP boundary — Node scripts, CLIs, server endpoints that respond with a final JSON object instead of a stream, or tests — you can consume `chat({ outputSchema, stream: true })` as a plain async iterable:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({ name: z.string(), age: z.number(), email: z.string().email() });

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Extract: John Doe is 30, john@example.com" }],
  outputSchema: PersonSchema,
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "structured-output.complete") {
    // Validated and typed against PersonSchema.
    console.log(chunk.value.object.name);
    console.log(chunk.value.object.age);
  }
}
```

This is the same `StructuredOutputStream<T>` the server endpoint above hands to `toServerSentEventsResponse`. Pick this shape when you're a single process end-to-end; use the server-endpoint-plus-`useChat` shape when there's a network in the middle.

## Combining with Tools

Structured outputs work seamlessly with the agentic tool loop. When both `outputSchema` and `tools` are provided, TanStack AI will:

1. Execute the full agentic loop (running tools as needed)
2. Once complete, generate the final structured output
3. Return the validated, typed result

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const getProductPrice = toolDefinition({
  name: "get_product_price",
  description: "Get the current price of a product",
  inputSchema: z.object({
    productId: z.string(),
  }),
}).server(async ({ input }) => {
  // Fetch price from database
  return { price: 29.99, currency: "USD" };
});

const RecommendationSchema = z.object({
  productName: z.string(),
  currentPrice: z.number(),
  reason: z.string(),
});

const recommendation = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [
    {
      role: "user",
      content: "Recommend a product for a developer",
    },
  ],
  tools: [getProductPrice],
  outputSchema: RecommendationSchema,
});

// The AI will call the tool to get prices, then return structured output
console.log(recommendation.productName);
console.log(recommendation.currentPrice);
console.log(recommendation.reason);
```

### Streaming with tools that may pause

When you combine `tools` + `outputSchema` + `stream: true`, the agent loop runs first — its events stream through, and only after all tools complete does the structured output stream emit `structured-output.complete`. Two situations can interrupt that flow before the terminal event arrives:

1. **A server tool with `needsApproval: true` is queued.** The agent loop pauses and the queued tool-call lands on the assistant message as a `ToolCallPart` with `state === "approval-requested"`. You respond by calling `addToolApprovalResponse({ id, approved })` from the hook return — same flow as in a normal chat. See [Tool Approval Flow](../tools/tool-approval) for the full pattern.
2. **A client tool is invoked.** If you registered the tool with an `execute` function, the client runs it automatically and posts the result back — no extra code on your side. If you want to handle it manually, listen for `onToolCall` and respond with `addToolResult({ toolCallId, tool, output, state })`. See [Client Tools](../tools/client-tools) for details.

There's nothing structured-output-specific in either flow — both reuse the standard chat pause/resume APIs. The structured stream layers on top: once tools complete (or the user approves), the agent loop finishes, the structured-output stream takes over, `partial` fills in, and `final` snaps when `structured-output.complete` arrives. For example, an approval-gated tool inside a structured-output run looks like:

```tsx
const { messages, sendMessage, partial, final, addToolApprovalResponse } = useChat({
  connection: fetchServerSentEvents("/api/recommend"),
  outputSchema: RecommendationSchema,
  tools: [sendEmail], // server tool with needsApproval: true
});

const last = messages.at(-1);

return (
  <>
    {last?.parts.map((part, i) => {
      // Surface approval prompts inline, the same way Tool Approval Flow shows it.
      if (
        part.type === "tool-call" &&
        part.state === "approval-requested" &&
        part.approval
      ) {
        return (
          <ApprovalPrompt
            key={i}
            part={part}
            onApprove={() =>
              addToolApprovalResponse({ id: part.approval!.id, approved: true })
            }
            onDeny={() =>
              addToolApprovalResponse({ id: part.approval!.id, approved: false })
            }
          />
        );
      }
      if (part.type === "thinking") return <ReasoningView key={i} text={part.text} />;
      if (part.type === "tool-call") return <ToolCallView key={i} part={part} />;
      return null; // hide TextPart (raw JSON when outputSchema is set)
    })}

    <StructuredView data={final ?? partial} />
  </>
);
```

While the approval is pending, `partial` stays at its last value and `final` stays `null`. As soon as the user approves (or denies and the loop resumes), the agent loop continues, the structured stream runs, and `partial` / `final` populate.

## Using Plain JSON Schema

If you prefer not to use a schema library, you can pass a plain JSON Schema object:

```typescript
import type { JSONSchema } from "@tanstack/ai";

const schema: JSONSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "The person's name" },
    age: { type: "number", description: "The person's age" },
  },
  required: ["name", "age"],
};

const result = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Extract: John is 25 years old" }],
  outputSchema: schema,
});

// Note: With plain JSON Schema, TypeScript infers `unknown` type
// You'll need to cast or validate the result yourself
const person = result as { name: string; age: number };
```

> **Note:** When using plain JSON Schema, TypeScript cannot infer the return type. The result will be typed as `unknown`. For full type safety, use a schema library like Zod.

## Provider Support

Structured outputs are supported by all major providers through their native APIs:

| Provider | Implementation |
|----------|---------------|
| OpenAI | Uses `response_format` with `json_schema` |
| Anthropic | Uses tool-based extraction |
| Google Gemini | Uses `responseSchema` |
| Ollama | Uses JSON mode with schema |

TanStack AI handles the provider-specific implementation details automatically, so you can use the same code across different providers.

## Best Practices

1. **Use descriptive field names and descriptions** - This helps the AI understand what data to extract

2. **Keep schemas focused** - Extract only the data you need; simpler schemas produce more reliable results

3. **Use optional fields appropriately** - Mark fields as optional when the data might not be present in the source

4. **Validate edge cases** - Test with various inputs to ensure the schema handles edge cases correctly

5. **Use enums for constrained values** - When a field has a limited set of valid values, use enums:

   ```typescript
   const schema = z.object({
     status: z.enum(["pending", "approved", "rejected"]),
     priority: z.enum(["low", "medium", "high"]),
   });
   ```

## Error Handling

If the AI response doesn't match your schema, TanStack AI will throw a validation error:

```typescript
try {
  const result = await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "..." }],
    outputSchema: MySchema,
  });
} catch (error) {
  if (error instanceof Error) {
    console.error("Structured output failed:", error.message);
  }
}
```

The error will include details about which fields failed validation, helping you debug schema mismatches.
