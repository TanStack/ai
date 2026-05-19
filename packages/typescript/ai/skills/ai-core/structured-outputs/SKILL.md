---
name: ai-core/structured-outputs
description: >
  Type-safe JSON schema responses from LLMs using outputSchema on chat()
  and useChat(). Supports Zod, ArkType, and Valibot schemas. The adapter
  handles provider-specific strategies transparently — never configure
  structured output at the provider level. Pass stream:true alongside
  outputSchema for incremental JSON deltas + a terminal validated object
  via the `structured-output.complete` event. Every assistant turn in
  useChat carries its own typed `StructuredOutputPart` on
  `messages[i].parts`, so multi-turn structured chats preserve history
  automatically — partial/final derive from the latest assistant turn's
  part. convertSchemaToJsonSchema() for manual schema conversion.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/structured-outputs/overview.md'
  - 'TanStack/ai:docs/structured-outputs/one-shot.md'
  - 'TanStack/ai:docs/structured-outputs/streaming.md'
  - 'TanStack/ai:docs/structured-outputs/multi-turn.md'
  - 'TanStack/ai:docs/structured-outputs/with-tools.md'
---

# Structured Outputs

> **Dependency note:** This skill builds on ai-core. Read it first for critical rules. The `useChat` patterns below build on ai-core/chat-experience — read that for the base hook surface, then come back here for the structured-output specifics.

## Setup

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const person = await chat({
  adapter: openaiText('gpt-5.2'),
  messages: [{ role: 'user', content: 'John Doe, 30' }],
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
  }),
})

person.name // string — fully typed, no cast
person.age // number
```

When `outputSchema` is provided, `chat()` returns `Promise<InferSchemaType<TSchema>>` instead of `AsyncIterable<StreamChunk>`. The result is fully typed.

Adding `stream: true` switches the return to `StructuredOutputStream<InferSchemaType<TSchema>>` — incremental JSON deltas plus a terminal validated object. See **Pattern 3** below for direct iteration, **Pattern 4** for the `useChat` shape on the client, and **Pattern 5** for multi-turn structured chats.

## Decision: which pattern fits

| Building this                                                                                  | Use                                                              |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| One prompt in → one typed object out (script, server endpoint, CLI)                            | Pattern 1 (basic) or 2 (nested)                                  |
| A UI that fills in field by field as the model streams (progressive form, live card)           | Pattern 4 — `useChat({ outputSchema })`                          |
| Direct iteration of the stream in Node or tests                                                | Pattern 3 — async iterable                                       |
| Users iterate on a structured object across multiple turns (recipe builder, ticket refinement) | Pattern 5 — multi-turn structured chat                           |
| Tools that gather info, then return a typed object                                             | Combine any of the above with `tools` — see ai-core/tool-calling |

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

### Pattern 3: Direct stream iteration

Pass `stream: true` alongside `outputSchema` to get an async iterable of standard streaming chunks plus a terminal validated object. Use this when you're a single process end-to-end — Node script, CLI, test, or a server endpoint that responds with one JSON blob. For the in-browser progressive-UI case, jump to Pattern 4 instead.

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

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
    // Terminal event. `chunk.value.object` is fully validated and typed
    // against the schema you passed in — no helper or cast required.
    chunk.value.object.name // string
    chunk.value.object.age // number
    chunk.value.reasoning // string | undefined (thinking models only)
  }
}
```

The terminal event is a `CUSTOM` chunk: `{ type: 'CUSTOM', name: 'structured-output.complete', value: { object: T, raw: string, reasoning?: string } }`. The return type of `chat({ outputSchema, stream: true })` carries `T` through, so a plain discriminated narrow (`chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete'`) is enough — no type guard helper.

**Adapter coverage for streaming:**

| Adapter                                           | `outputSchema` + `stream: true`                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@tanstack/ai-openai`                             | Native single-request stream (Responses API)                                                  |
| `@tanstack/ai-openrouter`                         | Native single-request stream                                                                  |
| `@tanstack/ai-grok`                               | Native single-request stream (Chat Completions)                                               |
| `@tanstack/ai-groq`                               | Native single-request stream (Chat Completions)                                               |
| All other adapters (anthropic, gemini, ollama, …) | Fallback: runs non-streaming `structuredOutput`, emits one `structured-output.complete` event |

Consumer code is identical across providers — always read the final object off `structured-output.complete`. You only see incremental `TEXT_MESSAGE_CONTENT` deltas when the adapter implements `structuredOutputStream` natively.

### Pattern 4: useChat with outputSchema (progressive UI)

Pass `outputSchema` to `useChat` and you get a `partial` field that fills in as JSON streams in, plus a `final` field that snaps to the validated object on the terminal event. No `onChunk` ceremony, no manual JSON accumulation, no `parsePartialJSON` calls.

**Server** (same as Pattern 3, just behind an SSE endpoint):

```typescript
// app/api/extract-person/route.ts (or your framework's equivalent)
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
    outputSchema: PersonSchema,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

**Client:**

```tsx
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { z } from 'zod'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

function PersonExtractor() {
  const { sendMessage, isLoading, partial, final } = useChat({
    connection: fetchServerSentEvents('/api/extract-person'),
    outputSchema: PersonSchema,
  })

  return (
    <div>
      <button
        disabled={isLoading}
        onClick={() => sendMessage('Extract: John Doe, 30, john@example.com')}
      >
        Extract
      </button>
      {/* `partial` fills in field by field while streaming. */}
      <p>Name: {partial.name ?? '…'}</p>
      <p>Age: {partial.age ?? '…'}</p>
      <p>Email: {partial.email ?? '…'}</p>
      {final && <pre>Validated: {JSON.stringify(final, null, 2)}</pre>}
    </div>
  )
}
```

- `partial` is `DeepPartial<z.infer<typeof PersonSchema>>` — every property optional, every nested array element optional. Updated from `TEXT_MESSAGE_CONTENT` deltas.
- `final` is `z.infer<typeof PersonSchema> | null` — populated when `structured-output.complete` arrives.
- `outputSchema` is for client-side type inference only. **Validation runs on the server** against the schema you pass to `chat({ outputSchema })` there.
- Same shape works for non-streaming adapters: the fallback path emits one whole-JSON `TEXT_MESSAGE_CONTENT` then the terminal event, so `partial` populates and `final` snaps in the same render tick — same consumer code as the native-streaming providers, just without an intermediate field-by-field reveal.

### Pattern 5: Multi-turn structured chat

Every assistant turn produced by `useChat({ outputSchema })` carries its own typed `StructuredOutputPart` on `messages[i].parts`. Old turns stay renderable; new turns produce new parts; history is preserved without manual state plumbing. This is what makes the recipe-builder shape ("now make it vegan") work.

```tsx
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import type { StructuredOutputPart } from '@tanstack/ai-client'
import { z } from 'zod'

const RecipeSchema = z.object({
  title: z.string(),
  cuisine: z.string(),
  servings: z.number(),
  ingredients: z.array(z.object({ item: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
})
type Recipe = z.infer<typeof RecipeSchema>
type RecipePart = StructuredOutputPart<Recipe>

function RecipeBuilder() {
  const { messages, sendMessage } = useChat({
    outputSchema: RecipeSchema,
    connection: fetchServerSentEvents('/api/recipes'),
  })

  return (
    <div>
      {messages.map((m) => {
        if (m.role === 'user') {
          const text = m.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.content)
            .join('')
          return <UserBubble key={m.id} text={text} />
        }
        if (m.role === 'assistant') {
          // `data` is `Recipe` because the schema generic flows from
          // `useChat({ outputSchema })` through `messages` to the part.
          const part = m.parts.find(
            (p): p is RecipePart => p.type === 'structured-output',
          )
          if (!part) return null
          return <RecipeCard key={m.id} part={part} />
        }
        return null
      })}
      <button onClick={() => sendMessage('pasta for two')}>Cook</button>
      <button onClick={() => sendMessage('now make it vegan')}>Modify</button>
    </div>
  )
}

function RecipeCard({ part }: { part: RecipePart }) {
  // `data` lands on complete, `partial` fills in while streaming.
  // Both are typed against the schema. No casts.
  const recipe = part.data ?? part.partial ?? ({} as Partial<Recipe>)
  return <h3>{recipe.title ?? 'Plating up…'}</h3>
}
```

Key behaviors:

- **Per-turn parts.** Each `sendMessage()` produces a new assistant message with its own `StructuredOutputPart`. The previous turn's part is untouched — `messages.map(...)` renders the whole history.
- **Typed by schema.** `messages[i].parts.find(p => p.type === 'structured-output').data` is typed as `Recipe` (no cast, no `unknown`). Works because `useChat<TSchema>` threads `InferSchemaType<TSchema>` down through `UIMessage<TTools, TData>` → `MessagePart<TTools, TData>` → `StructuredOutputPart<TData>`. **In `@tanstack/ai` core** the message types are single-generic (`UIMessage<TData>`); the tools generic lives in `@tanstack/ai-client` and the framework hook packages — import from your framework package or `ai-client`, not from `@tanstack/ai`.
- **`partial` / `final` are derived.** The hook-level `partial` and `final` are NOT singleton state — they're derived from the latest assistant message's part (the one after the most recent user message). Between `sendMessage()` and the first chunk, `partial` reads `{}` and `final` reads `null` because no new assistant turn exists yet.
- **Round-trip preserves history.** When the client sends turn N+1, each prior assistant turn's `structured-output` part is serialized back as `{ role: 'assistant', content: <part.raw> }` so the model sees its own prior structured response. Streaming / errored parts are dropped from the round-trip.

## Common Mistakes

### HIGH: Filtering `TextPart`s out of `useChat` renderers when using `outputSchema`

Earlier versions of the library routed structured-output JSON deltas through `TextPart`, so renderers had to filter them out:

```tsx
// OBSOLETE — this guard was needed only because JSON used to land in a TextPart
const last = messages.at(-1)
last?.parts.map((part) => {
  if (part.type === 'text') return null // ❌ hides the structured JSON
  // ...
})
```

That hack is **gone**. With `outputSchema` set, `TEXT_MESSAGE_CONTENT` deltas now route into a dedicated `StructuredOutputPart` (with `raw`, `partial`, `data`, `status`, optional `errorMessage`). Render the structured part directly; let real `TextPart`s through.

```tsx
// CORRECT — find the structured-output part directly; let actual TextParts render
last?.parts.map((part, i) => {
  if (part.type === 'thinking')
    return <ReasoningView key={i} text={part.content} />
  if (part.type === 'tool-call') return <ToolCallView key={i} part={part} />
  if (part.type === 'structured-output')
    return <RecipeCard key={i} part={part} />
  if (part.type === 'text') return <p key={i}>{part.content}</p> // ← real text, not JSON
  return null
})
```

If you still have an `if (part.type === 'text') return null` line in a structured-output renderer specifically for "hiding the JSON," delete it.

Source: PR #577 — structured-output became a typed UIMessage part.

### HIGH: Treating `partial` / `final` as sticky state across turns

`partial` and `final` are **derived from the latest assistant message's `structured-output` part**, not a sticky hook-level slot. In a multi-turn chat:

- Between `sendMessage()` and the first chunk, `partial` reads `{}` and `final` reads `null` (no assistant message after the latest user yet).
- Once the latest turn completes, `partial === final`. Earlier turns' data is NOT in `partial` / `final` — it lives on the prior assistant messages' parts.

To render history, walk `messages` directly (see Pattern 5). Use `partial` / `final` for a sticky summary of the **most recent** turn only.

```tsx
// WRONG — `final` only reflects the latest turn; earlier recipes vanish from this view
{final && <RecipeCard recipe={final} />}

// CORRECT for history — walk messages, render every assistant's structured-output part
{messages.map((m) =>
  m.role === 'assistant'
    ? m.parts.find((p) => p.type === 'structured-output')
      ? <RecipeCard key={m.id} part={...} />
      : null
    : null
)}
```

Source: PR #577 — partial/final derive from the latest assistant turn's part.

### HIGH: Parsing streaming JSON deltas yourself

When iterating `chat({ outputSchema, stream: true })` directly (Pattern 3), the `TEXT_MESSAGE_CONTENT` chunks contain _partial_ JSON fragments — they are not valid JSON until the stream completes. Always read the validated object from the terminal `structured-output.complete` event. Validation runs once, on the complete payload.

```typescript
// WRONG -- partial JSON, throws SyntaxError mid-stream, no schema validation
for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    const obj = JSON.parse(chunk.delta) // ❌ partial, invalid
  }
}

// CORRECT -- trust the terminal event
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
    const result = chunk.value.object // ✅ typed and validated
  }
}
```

If you need progressive parsed state in a non-React environment, use a partial-JSON parser on the accumulated raw string at render time — but do NOT treat the result as schema-validated; only the terminal event is. In `useChat`, this is already done for you (`partial` field on Pattern 4).

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

- See also: **ai-core/chat-experience/SKILL.md** — Base `useChat` surface; the structured-output additions documented here layer on top.
- See also: **ai-core/adapter-configuration/SKILL.md** — Adapter handles structured-output strategy transparently.
- See also: **ai-core/tool-calling/SKILL.md** — Combine `tools` with `outputSchema` for an agent loop that runs tools first and returns a typed object. Tool-approval and client-tool flows compose with structured runs without extra wiring; see [docs/structured-outputs/with-tools.md](https://github.com/TanStack/ai/blob/main/docs/structured-outputs/with-tools.md).
