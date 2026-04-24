---
name: ai-core/structured-outputs
description: >
  Type-safe JSON schema responses from LLMs using outputSchema on chat().
  Supports Zod, ArkType, and Valibot schemas. The adapter handles
  provider-specific strategies transparently — never configure structured
  output at the provider level. convertSchemaToJsonSchema() for manual
  schema conversion.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/chat/structured-outputs.md'
---

# Structured Outputs

> **Dependency note:** This skill builds on ai-core. Read it first for critical rules.

## Setup

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          content: 'Extract the person info from: John is 30 years old',
        },
      ],
    },
  ],
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
  }),
})
```

When `outputSchema` is provided, `chat()` returns `Promise<InferSchemaType<TSchema>>` instead of `AsyncIterable<StreamChunk>`. The result is fully typed based on the schema.

## Core Patterns

### Pattern 1: Basic structured output with Zod

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const PersonSchema = z.object({
  name: z.string().meta({ description: "The person's full name" }),
  age: z.number().meta({ description: "The person's age in years" }),
  email: z.string().email().meta({ description: 'Email address' }),
})

// chat() returns Promise<{ name: string; age: number; email: string }>
const person = await chat({
  adapter: openaiText('gpt-5.2'),
  messages: [
    {
      role: 'user',
      content:
        'Extract the person info: John Doe is 30 years old, email john@example.com',
    },
  ],
  outputSchema: PersonSchema,
})

console.log(person.name) // "John Doe"
console.log(person.age) // 30
console.log(person.email) // "john@example.com"
```

### Pattern 2: Complex nested schemas

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { z } from 'zod'

const CompanySchema = z.object({
  name: z.string(),
  founded: z.number().meta({ description: 'Year the company was founded' }),
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
      revenue: z
        .number()
        .meta({ description: 'Annual revenue in millions USD' }),
      profitable: z.boolean(),
    })
    .optional(),
})

const company = await chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages: [
    {
      role: 'user',
      content: 'Extract company info from this article: ...',
    },
  ],
  outputSchema: CompanySchema,
})

// Full type safety on nested properties
console.log(company.headquarters.city)
console.log(company.employees[0].role)
console.log(company.financials?.revenue)
```

## Common Mistakes

### HIGH: Trying to implement provider-specific structured output strategies

The adapter already handles provider differences (OpenAI uses `response_format`, Anthropic uses tool-based extraction, Gemini uses `responseSchema`). Never configure this yourself.

```typescript
// WRONG -- do not set provider-specific response format
chat({
  adapter,
  messages,
  modelOptions: {
    responseFormat: { type: 'json_schema', json_schema: mySchema },
  },
})

// CORRECT -- just pass outputSchema, the adapter handles the rest
chat({
  adapter,
  messages,
  outputSchema: z.object({ name: z.string(), age: z.number() }),
})
```

There is no scenario where you need to know the provider's strategy. Just pass `outputSchema` to `chat()`.

Source: maintainer interview

### HIGH: Passing raw objects instead of using the project's schema library

Agents often generate raw JSON Schema objects or plain TypeScript types instead
of using the schema validation library already in the project (Zod, ArkType,
Valibot). Always check what the project uses and match it.

```typescript
// WRONG -- raw object, no runtime validation, no type inference
chat({
  adapter,
  messages,
  outputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    required: ['name', 'age'],
    additionalProperties: false,
  },
})

// CORRECT -- use the project's schema library (e.g. Zod)
import { z } from 'zod'

chat({
  adapter,
  messages,
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
  }),
})
```

Using the project's schema library gives you runtime validation, TypeScript
type inference on the result, and correct JSON Schema conversion automatically.
Check `package.json` for `zod`, `arktype`, or `valibot` and use whichever is
already installed.

Source: maintainer interview

## Cross-References

- See also: ai-core/adapter-configuration/SKILL.md -- Adapter handles structured output strategy transparently
