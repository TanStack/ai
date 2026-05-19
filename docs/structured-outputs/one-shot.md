---
title: One-Shot Extraction
id: structured-outputs-one-shot
order: 2
description: "Extract a single typed object from a prompt with chat({ outputSchema }). Field descriptions, nested schemas, plain JSON Schema, error handling — everything you need for a single round-trip from text in to typed data out."
keywords:
  - tanstack ai
  - structured outputs
  - one-shot extraction
  - chat outputSchema
  - zod
  - json schema
  - type inference
---

You have unstructured input — a paragraph of text, a freeform user prompt, the body of an email — and you want exactly one typed object back. No streaming, no history, no agent loop: one prompt in, one validated object out.

By the end of this guide you'll have a working `chat({ outputSchema })` call returning a fully-typed result, know how to describe fields so the model fills them correctly, and have a pattern for handling validation errors.

> **Note:** If you want to stream the result field-by-field into a UI, you want [Streaming UIs](./streaming) instead. If you want users to iterate on the object across multiple turns, you want [Multi-Turn Chat](./multi-turn). This page is for the single-extraction case.

## Basic Usage

Define a schema and pass it as `outputSchema`. The return type follows from the schema — no cast needed.

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
  adapter: openaiText("gpt-5.2"),
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

## Type Inference

The return type of `chat()` switches on `outputSchema`:

| Configuration | Return type |
|---|---|
| No `outputSchema` | `AsyncIterable<StreamChunk>` |
| With `outputSchema` (this page) | `Promise<InferSchemaType<TSchema>>` |
| With `outputSchema` and `stream: true` | `StructuredOutputStream<InferSchemaType<TSchema>>` (see [Streaming UIs](./streaming)) |

The TypeScript type of `person` above is `{ name: string; age: number; email: string }` — derived from `PersonSchema`. No runtime cast, no `as`, no separate type definition.

## Field Descriptions

Field descriptions tell the model what data to extract. They become part of the JSON Schema sent to the provider — the model sees them as hints. In Zod 4+ use `.meta()`:

```typescript
const ProductSchema = z.object({
  name: z.string().meta({ description: "The product name" }),
  price: z.number().meta({ description: "Price in USD" }),
  inStock: z.boolean().meta({
    description: "Whether the product is currently available",
  }),
  categories: z
    .array(z.string())
    .meta({
      description:
        "Product categories like 'electronics', 'clothing', etc.",
    }),
});
```

Descriptions earn their keep when:
- The field name is ambiguous (`price` — in what currency?)
- The expected unit isn't obvious (`duration` — seconds or minutes?)
- The schema is being applied to text where the same concept could be phrased many ways

## Complex Nested Schemas

Schemas can nest arbitrarily. The inferred type follows the structure.

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
  adapter: anthropicText("claude-sonnet-4-5"),
  messages: [{ role: "user", content: "Extract company info from this article: ..." }],
  outputSchema: CompanySchema,
});

company.headquarters.city; // string
company.employees[0].role; // string
company.financials?.profitable; // boolean | undefined
```

## Using Plain JSON Schema

If you don't want a schema library, pass a JSON Schema object directly. The trade-off: TypeScript can't infer the return type, so the result is `unknown` and you take responsibility for the runtime shape.

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

// Result is `unknown` — narrow before use.
const person = result as { name: string; age: number };
```

Prefer a schema library when you can — type inference is worth it.

## Error Handling

If the model's response doesn't satisfy your schema, `chat()` throws a validation error. The message includes the failing fields.

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
    // The message names which fields failed validation.
  }
}
```

Provider-level errors (auth failure, rate limit, network) throw the same way — wrap the call in `try` / `catch` to handle both.

## Best Practices

1. **Use descriptive field names and descriptions.** The model uses them as hints.
2. **Keep schemas focused.** Extract only what you need — smaller schemas produce more reliable results.
3. **Mark fields optional when they really are.** Don't force the model to invent a value just because the schema demands one.
4. **Use enums for constrained values.**

   ```typescript
   const schema = z.object({
     status: z.enum(["pending", "approved", "rejected"]),
     priority: z.enum(["low", "medium", "high"]),
   });
   ```

5. **Test edge cases.** Empty inputs, ambiguous inputs, inputs with extra fields — make sure the schema handles them the way you expect.
