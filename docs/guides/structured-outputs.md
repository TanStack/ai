---
title: Structured Outputs
id: structured-outputs
order: 6
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

> **Note:** Refer to your schema library's documentation for details on defining schemas and using features like `.describe()` for field descriptions. TanStack AI will convert your schema to JSON Schema format automatically.

## Basic Usage

Here's how to use structured outputs with a Zod schema:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

// Define your schema
const PersonSchema = z.object({
  name: z.string().describe("The person's full name"),
  age: z.number().describe("The person's age in years"),
  email: z.string().email().describe("The person's email address"),
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

Schema field descriptions help the AI understand what data to extract. Most schema libraries support a `.describe()` method:

```typescript
const ProductSchema = z.object({
  name: z.string().describe("The product name"),
  price: z.number().describe("Price in USD"),
  inStock: z.boolean().describe("Whether the product is currently available"),
  categories: z
    .array(z.string())
    .describe("Product categories like 'electronics', 'clothing', etc."),
});
```

These descriptions are included in the JSON Schema sent to the provider, giving the AI context about each field.

## Complex Nested Schemas

You can define deeply nested structures:

```typescript
const CompanySchema = z.object({
  name: z.string(),
  founded: z.number().describe("Year the company was founded"),
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
      revenue: z.number().describe("Annual revenue in millions USD"),
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
