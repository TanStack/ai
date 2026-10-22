---
title: One-Shot Extraction
id: structured-outputs-one-shot
order: 2
description: "Turn a piece of text into one typed object with chat({ outputSchema }). Write good field descriptions, send the object to the browser, and handle errors."
keywords:
  - tanstack ai
  - structured outputs
  - one-shot extraction
  - chat outputSchema
  - zod
  - json schema
  - type inference
---

`chat()` with `outputSchema` returns one typed object from text. It does not stream, store history, or run tools.

## Quick setup

### 1. Define the schema

The descriptions go to the model as hints for each field:

```typescript
// schemas/person.ts
import { z } from "zod";

export const PersonSchema = z.object({
  name: z.string().meta({ description: "The full name of the person" }),
  age: z.number().meta({ description: "The age in years" }),
  email: z.string().email().meta({ description: "The email address" }),
});
```

### 2. Await the object

```typescript
// extract.ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "./schemas/person";

const person = await chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [
    {
      role: "user",
      content:
        "Extract the person info: John Doe is 30 years old, email john@example.com",
    },
  ],
  threadId: "thread-1",
  outputSchema: PersonSchema,
});

console.log(person.name, person.age, person.email);
```

Run the file. It prints `John Doe 30 john@example.com`. The type of `person` is `{ name: string; age: number; email: string }`, and it comes from `PersonSchema`.

## How it works

- `outputSchema` makes `chat()` return `Promise<T>`, where `T` is the type your schema infers.
- The engine validates the reply against your schema before the promise resolves.
- If the reply does not match, the promise rejects. See [Handle errors](#handle-errors).

Need the object to fill in while it streams? Read [Streaming UIs](./streaming). Need the user to change it over many turns? Read [Multi-Turn Chat](./multi-turn).

## Send the object to the browser

### As plain JSON

If the browser needs only the finished object, await it on the server and return it as JSON:

```typescript
// api/extract-person.ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";
import { PersonSchema } from "../schemas/person";

const RequestBody = z.object({ text: z.string() });

export async function POST(request: Request) {
  const { text } = RequestBody.parse(await request.json());

  const person = await chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: [{ role: "user", content: `Extract the person info: ${text}` }],
    threadId: "thread-1",
    outputSchema: PersonSchema,
  });

  return Response.json(person);
}
```

On the client, fetch it and parse it with the same schema:

```typescript
import { PersonSchema } from "./schemas/person";

const res = await fetch("/api/extract-person", {
  method: "POST",
  body: JSON.stringify({ text: "John Doe, 30, john@example.com" }),
});
const person = PersonSchema.parse(await res.json());

console.log(person.name);
```

You own the request and the types. No TanStack client API is involved.

### With `useChat`

Use `useChat` when you want its loading state and a typed `final`. `useChat` reads a stream, so the server sends one with `stream: true`:

```typescript
// api/extract-person.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "../schemas/person";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    outputSchema: PersonSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { PersonSchema } from "./schemas/person";

export function PersonExtractor() {
  const { sendMessage, isLoading, final } = useChat({
    connection: fetchServerSentEvents("/api/extract-person"),
    threadId: "support-chat",
    outputSchema: PersonSchema,
  });

  return (
    <div>
      <button
        disabled={isLoading}
        onClick={() => void sendMessage("Extract: John Doe, 30, john@example.com")}
      >
        Extract
      </button>
      {final && (
        <p>
          {final.name} is {final.age}
        </p>
      )}
    </div>
  );
}
```

What you get from the hook:

- `final`: `T | null`. The full object, set when the run completes.
- `partial`: `DeepPartial<T>`. The same object as it fills in. You can ignore it for a one-shot UI. [Streaming UIs](./streaming) shows how to use it.
- The schema on `useChat` gives the client its types and parses `partial`. The server does not validate on the streaming path. See [Where validation runs](./overview#where-validation-runs).

Anthropic and Ollama send the object as one event. `partial` stays `{}`, and `final` arrives in one step. Your client code does not change.

To keep the awaited object on the server and still use `useChat`, send it with `toJsonResponse(person)`. See [Send a structured output](../transports/json#send-a-structured-output).

## Write a good schema

1. **Describe ambiguous fields.** `price` in which currency? `duration` in seconds or minutes? Put the answer in the description.
2. **Keep the schema small.** Ask only for the fields you need. Small schemas give more reliable results.
3. **Make a field optional only when it can be missing.** A required field makes the model invent a value.
4. **Use enums for fixed values.**
5. **Try edge cases.** Send empty, ambiguous, and noisy input, and look at what comes back.

Enums and descriptions together:

```typescript
import { z } from "zod";

export const TicketSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  priority: z.enum(["low", "medium", "high"]),
  price: z.number().meta({ description: "Price in USD" }),
  categories: z
    .array(z.string())
    .meta({ description: "Categories such as 'billing' or 'login'" }),
});
```

Schemas can nest. The inferred type follows the structure:

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

const article =
  "Acme was founded in 1998 in Berlin, Germany. Jane Smith leads Sales as VP.";

const company = await chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: `Extract company info: ${article}` }],
  threadId: "thread-1",
  outputSchema: CompanySchema,
});

console.log(company.headquarters.city); // string
console.log(company.employees.map((employee) => employee.role)); // string[]
console.log(company.financials?.profitable); // boolean | undefined
```

## Handle errors

If the reply does not match your schema, `chat()` throws. The message names the fields that failed. Provider errors (auth, rate limit, network) throw the same way, so one `try` / `catch` handles both:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "./schemas/person";

try {
  const person = await chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: [{ role: "user", content: "John Doe is 30" }],
    threadId: "thread-1",
    outputSchema: PersonSchema,
  });
  console.log(person.name);
} catch (error) {
  if (error instanceof Error) {
    console.error("Structured output failed:", error.message);
  }
}
```

## Advanced

### Using plain JSON Schema

You can pass a JSON Schema object with no schema library. TypeScript cannot infer a type from it, so the result is `unknown`. Validate it before you use it.

```typescript
import { chat } from "@tanstack/ai";
import type { JSONSchema } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const schema: JSONSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "The name of the person" },
    age: { type: "number", description: "The age of the person" },
  },
  required: ["name", "age"],
};

const result = await chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Extract: John is 25 years old" }],
  threadId: "thread-1",
  outputSchema: schema,
});

// `result` is `unknown`. Narrow it before use.
if (typeof result === "object" && result !== null && "name" in result) {
  console.log(result.name);
}
```

A schema library is the better choice when you can use one, because you get the types.

### Return types of `chat()`

| Options | Return type |
| --- | --- |
| No `outputSchema`, `stream: false` | `Promise<ChatResult>` (`{ text, chunks }`) |
| No `outputSchema`, `stream: true` (the default for plain chat) | `AsyncIterable<StreamChunk>` |
| `outputSchema` (this page) | `Promise<InferSchemaType<TSchema>>` |
| `outputSchema` and `stream: true` | `StructuredOutputStream<InferSchemaType<TSchema>>`. See [Streaming UIs](./streaming). |

### Read the provider error

When the provider rejects the request, the message can be short, for example `Provider returned error`. The full error body of the provider is on `error.cause`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "./schemas/person";

try {
  await chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: [{ role: "user", content: "John Doe is 30" }],
    threadId: "thread-1",
    outputSchema: PersonSchema,
  });
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message, error.cause);
  }
}
```

### Recover the model text

Sometimes a model returns a valid JSON object and then more text, for example a second copy of the object. The JSON parse then fails, and `chat()` throws. The error message shows only the first 200 characters. The full text is on `error.rawText`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "./schemas/person";

try {
  await chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: [{ role: "user", content: "John Doe is 30" }],
    threadId: "thread-1",
    outputSchema: PersonSchema,
  });
} catch (error) {
  if (error instanceof Error && "rawText" in error) {
    console.error("Model text:", error.rawText);
  }
}
```

To keep the answer, parse and validate that text yourself.
