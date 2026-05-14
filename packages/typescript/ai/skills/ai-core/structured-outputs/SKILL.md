---
name: ai-core/structured-outputs
description: >
  Type-safe JSON schema responses from LLMs using outputSchema on chat().
  Supports Zod, ArkType, and Valibot schemas. The adapter handles
  provider-specific strategies transparently — never configure structured
  output at the provider level. Pass stream:true alongside outputSchema for
  incremental JSON deltas + a terminal validated object via the
  `structured-output.complete` event. convertSchemaToJsonSchema() for manual
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

Adding `stream: true` switches the return to `StructuredOutputStream<InferSchemaType<TSchema>>` — incremental JSON deltas plus a terminal validated object. See **Pattern 3** below.

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

### Pattern 3: Streaming structured output

Pass `stream: true` alongside `outputSchema` to receive incremental JSON deltas while the model generates, plus a final validated typed object. Useful for streaming partial UI (progress views, typewriter previews, partially-filled forms).

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages: [
    { role: 'user', content: 'Extract: John Doe is 30, john@example.com' },
  ],
  outputSchema: PersonSchema,
  stream: true,
})

let raw = ''
for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    // Partial JSON text — drive progress UI only. Do NOT JSON.parse.
    raw += chunk.delta
  } else if (
    chunk.type === 'CUSTOM' &&
    chunk.name === 'structured-output.complete'
  ) {
    // Terminal event. `chunk.value.object` is fully validated and typed
    // against the schema you passed in — no helper or cast required.
    chunk.value.object.name // string
    chunk.value.object.age // number
    chunk.value.reasoning // string | undefined (thinking models only)
  }
}
```

The terminal event is a `CUSTOM` chunk: `{ type: 'CUSTOM', name: 'structured-output.complete', value: { object: T, raw: string, reasoning?: string } }`. The return type of `chat({ outputSchema, stream: true })` carries `T` through to the terminal event, so a plain discriminated narrow (`chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete'`) is enough — no type guard helper needed.

**Adapter coverage for streaming:**

| Adapter                                           | `outputSchema` + `stream: true`                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@tanstack/ai-openai`                             | Native single-request stream (Responses API)                                                  |
| `@tanstack/ai-openrouter`                         | Native single-request stream                                                                  |
| `@tanstack/ai-grok`                               | Native single-request stream (Chat Completions)                                               |
| `@tanstack/ai-groq`                               | Native single-request stream (Chat Completions)                                               |
| All other adapters (anthropic, gemini, ollama, …) | Fallback: runs non-streaming `structuredOutput`, emits one `structured-output.complete` event |

The consumer code is identical across providers — always read the final object off `structured-output.complete`. You only see incremental deltas when the adapter implements `structuredOutputStream` natively.

## Common Mistakes

### HIGH: Parsing streaming JSON deltas yourself

When using `chat({ outputSchema, stream: true })`, the `TEXT_MESSAGE_CONTENT` chunks contain _partial_ JSON fragments — they are not valid JSON until the stream completes. Always read the validated object from the terminal `structured-output.complete` event. Validation runs once, on the complete payload.

```typescript
// WRONG -- partial JSON, throws SyntaxError mid-stream, no schema validation
for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    const obj = JSON.parse(chunk.delta) // ❌ partial, invalid
  }
}

// CORRECT -- accumulate deltas only for UX progress; trust the terminal event
let raw = ''
for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    raw += chunk.delta // optional: render a "streaming JSON" preview
  } else if (
    chunk.type === 'CUSTOM' &&
    chunk.name === 'structured-output.complete'
  ) {
    const result = chunk.value.object // ✅ typed and validated
  }
}
```

If you need progressive _parsed_ state (e.g. show fields as they arrive), use a partial-JSON parser on the accumulated `raw` string at render time — but do NOT treat the result as schema-validated; only the terminal event is.

Source: maintainer interview

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
- See also: ai-core/chat-experience/SKILL.md -- Consuming `StreamChunk` events on the client (the streaming variant uses the same chunk model plus the terminal `structured-output.complete` custom event)
