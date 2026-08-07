---
title: One-Shot Extraction
id: structured-outputs-one-shot
order: 2
description: "Extract one typed object with chat({ outputSchema }) — field hints, nested schemas, JSON Schema, errors."
keywords:
  - tanstack ai
  - structured outputs
  - one-shot extraction
  - chat outputSchema
  - zod
  - json schema
  - type inference
---

# One-Shot Extraction

If you need one prompt → one validated object (no history UI) → `await chat({ outputSchema })`.

Progressive UI → [Streaming](./streaming). Multi-turn history → [Multi-Turn](./multi-turn).

## Basic usage

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string().meta({ description: "The person's full name" }),
  age: z.number().meta({ description: "The person's age in years" }),
  email: z.string().email().meta({ description: "The person's email address" }),
});

const person = await chat({
  adapter: openaiText("gpt-5.5"),
  messages: [
    {
      role: "user",
      content:
        "Extract the person info: John Doe is 30 years old, email john@example.com",
    },
  ],
  outputSchema: PersonSchema,
});

person.name;  // string
person.age;   // number
person.email; // string
```

## Return types

| Configuration | Return type |
|---|---|
| No `outputSchema`, `stream: false` | `Promise<string>` |
| No `outputSchema`, `stream: true` (default) | `AsyncIterable<StreamChunk>` |
| With `outputSchema` (this page) | `Promise<InferSchemaType<TSchema>>` |
| With `outputSchema` + `stream: true` | `StructuredOutputStream<…>` — [Streaming](./streaming) |

## Field descriptions

Use `.meta({ description })` (Zod v4.2+) for ambiguous names, units, or freeform source text.

```typescript
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().meta({ description: "The product name" }),
  price: z.number().meta({ description: "Price in USD" }),
  inStock: z.boolean().meta({
    description: "Whether the product is currently available",
  }),
  categories: z
    .array(z.string())
    .meta({ description: "Product categories like 'electronics', 'clothing'" }),
});
```

## Nested schemas

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { z } from "zod";

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
    }),
  ),
  financials: z
    .object({
      revenue: z.number().meta({ description: "Annual revenue in millions USD" }),
      profitable: z.boolean(),
    })
    .optional(),
});

const company = await chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Extract company info from this article: ..." }],
  outputSchema: CompanySchema,
});

company.headquarters.city;
company.employees[0]!.role;
company.financials?.profitable;
```

## Plain JSON Schema

Result is `unknown` — validate before use:

```typescript
import { chat } from "@tanstack/ai";
import type { JSONSchema } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const schema: JSONSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "The person's name" },
    age: { type: "number", description: "The person's age" },
  },
  required: ["name", "age"],
};

const result = await chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Extract: John is 25 years old" }],
  outputSchema: schema,
});
```

## Errors

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const MySchema = z.object({
  name: z.string(),
  age: z.number(),
});

try {
  const result = await chat({
    adapter: openaiText("gpt-5.5"),
    messages: [{ role: "user", content: "..." }],
    outputSchema: MySchema,
  });
} catch (error) {
  if (error instanceof Error) {
    console.error("Structured output failed:", error.message);
  }
}
```

Schema failures and provider errors both throw.

## Client consumption

### Plain JSON (no hook)

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

// server
export async function POST(request: Request) {
  const body: unknown = await request.json();
  const text =
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    typeof body.text === "string"
      ? body.text
      : "";
  const person = await chat({
    adapter: openaiText("gpt-5.5"),
    messages: [{ role: "user", content: `Extract the person info: ${text}` }],
    outputSchema: PersonSchema,
  });
  return Response.json(person);
}

// client
const text = "John is 25 years old";
const res = await fetch("/api/extract-person", {
  method: "POST",
  body: JSON.stringify({ text }),
});
const person = PersonSchema.parse(await res.json());
```

### `useChat` + `final`

Server must stream (`stream: true` + `toServerSentEventsResponse`). Client treats it as one finished object:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";
import { PersonCard } from "./PersonCard";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

function PersonExtractor() {
  const { sendMessage, isLoading, final, partial } = useChat({
    connection: fetchServerSentEvents("/api/extract-person"),
    outputSchema: PersonSchema,
  });

  return (
    <div>
      <button
        disabled={isLoading}
        onClick={() => sendMessage("Extract: John Doe, 30, john@example.com")}
      >
        Extract
      </button>
      {final && <PersonCard person={final} />}
    </div>
  );
}
```

- `final` — `T | null` when complete
- `partial` — `DeepPartial<T>` while streaming (ignore for pure one-shot)
- Client schema is for TS + progressive parse; server still validates

Non-streaming adapters snap `final` in one event (`partial` stays `{}`). Progressive UI → [Streaming](./streaming); history → [Multi-Turn](./multi-turn).

## Practices

1. Describe ambiguous fields.
2. Keep schemas small.
3. Mark true optionals optional.
4. Prefer enums for closed sets.
5. Test empty / ambiguous / extra-field inputs.
