---
title: Structured Outputs Overview
id: structured-outputs-overview
order: 1
description: "Get a typed object back from the model instead of text. Pass a schema as outputSchema, read the result on the server or in useChat, then pick the streaming, multi-turn, tools, or harness guide."
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

Pass `outputSchema` so the model returns an object that matches the schema. The call fails when the output does not match.

Pass a schema as `outputSchema`. The model must answer in that shape, and you get a typed object back.

## Quick setup

This setup adds a "person extractor" to an app that already has chat. It takes about 5 minutes.

### 1. Install a schema library

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: zod
vue: zod
solid: zod
svelte: zod
preact: zod
angular: zod
vanilla: zod
octane: zod

<!-- ::end:tabs -->

### 2. Define the schema

Put the schema in a file that the server and the client can both import:

```typescript
// schemas/person.ts
import { z } from "zod";

export const PersonSchema = z.object({
  name: z.string().meta({ description: "The full name of the person" }),
  age: z.number().meta({ description: "The age in years" }),
  email: z.string().email(),
});
```

### 3. Add the server endpoint

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

### 4. Read the object on the client

Give `useChat` the same schema. Then read `final`:

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
        onClick={() => void sendMessage("John Doe is 30, john@example.com")}
      >
        Extract
      </button>
      {final && (
        <p>
          {final.name} ({final.age}): {final.email}
        </p>
      )}
    </div>
  );
}
```

Click Extract. When the run ends, the card shows `John Doe (30): john@example.com`. `final.age` is a `number`, with no cast.

Vue, Solid, Svelte, Angular, Preact, and Octane take the same `outputSchema` option and return the same `partial` and `final` values.

## How it works

1. TanStack AI converts your schema to JSON Schema.
2. The adapter sends that JSON Schema to the native structured-output API of the provider.
3. The server streams the JSON. The last event, `structured-output.complete`, holds the full object.
4. `useChat` sets `final` from that event. TypeScript infers its type from the schema.

## No UI? Await the object

In a script, a CLI, or a server job, leave out `stream: true`. Then `chat()` returns a promise of the typed object:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "./schemas/person";

const person = await chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "John Doe is 30, john@example.com" }],
  threadId: "thread-1",
  outputSchema: PersonSchema,
});

console.log(person.name, person.age);
```

## Pick your next page

| You want to | Read |
| --- | --- |
| Extract one object, with field hints and error handling | [One-Shot Extraction](./one-shot) |
| Fill a form or card field by field while the JSON streams | [Streaming UIs](./streaming) |
| Fill a table from streamed rows in a TanStack Start app | [Streaming Structured Table](../tutorials/streaming-structured-table) |
| Let the user change the object over many turns, and keep each version | [Multi-Turn Chat](./multi-turn) |
| Call tools first, then return a typed object | [With Tools](./with-tools) |
| Let a coding agent read files in a sandbox, then return a typed object | [Harness Agents](./harnesses) |

## Advanced

### Schema libraries

`outputSchema` accepts any library that implements [Standard JSON Schema](https://standardschema.dev/json-schema):

- [Zod](https://zod.dev/) (v4.2+)
- [ArkType](https://arktype.io/)
- [Valibot](https://valibot.dev/) (with `@valibot/to-json-schema`)
- Plain JSON Schema objects. You lose type inference. See [Using plain JSON Schema](./one-shot#using-plain-json-schema).

For field descriptions, refinements, and enums, read the docs of your schema library. TanStack AI converts the schema to JSON Schema for you.

### Provider support

Each adapter uses the native structured-output API of its provider. The same `chat({ outputSchema })` call works with all of them.

| Provider | Implementation |
| --- | --- |
| OpenAI | `response_format` with `json_schema` |
| Anthropic | Tool-based extraction |
| Google Gemini | `responseSchema` |
| Ollama | JSON mode with schema |
| OpenRouter, Grok, Groq | `response_format` with `json_schema` |
| Claude Code, Codex | Native schema flag on the same harness turn (`--json-schema`, `--output-schema`) |
| OpenCode, Grok Build, ACP compatible | Schema in the prompt, then the adapter parses the reply on the same turn |

For a coding agent in a sandbox, see [Harness Agents](./harnesses).

### When strict JSON schema is rejected

Some models reject strict JSON schema. They accept only JSON mode (`response_format` type `json_object`). A strict request to one of these models fails before the model runs.

The OpenRouter and Groq adapters find these models in their catalogs. For these models, `chat({ outputSchema })` does two things:

- It sends JSON mode.
- It adds your schema to the system prompt, because JSON mode does not send the schema.

If your schema is a Standard Schema, such as Zod, `await chat({ outputSchema })` still validates the reply. JSON of the wrong shape throws. TanStack AI does not validate a plain JSON Schema or a streamed reply. Validate those in your own code.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const Person = z.object({ name: z.string(), age: z.number() });

const person = await chat({
  adapter: openRouterText("qwen/qwen3.7-flash"),
  messages: [{ role: "user", content: "Return Ada Lovelace, age 36." }],
  threadId: "thread-1",
  outputSchema: Person,
});

console.log(person.name, person.age);
```

To send JSON mode to a model that is not in the catalog, set it in `modelOptions`:

- OpenRouter: `modelOptions: { responseFormat: { type: "json_object" } }`
- Groq: `modelOptions: { response_format: { type: "json_object" } }`

### Anthropic schema complexity limits

Anthropic compiles a structured-output schema into a grammar. It rejects a schema that is too large or too complex with a 400 error. Two common messages:

- `Schema is too complex for compilation`
- `output_config.format.schema: Invalid schema: The compiled grammar is too large`

This applies to Claude models directly and to `anthropic/*` models on OpenRouter. Other providers can accept the same schema.

If you get one of these errors, make the schema simpler. Constructs that add branches to the grammar cost more than size:

- `.optional()` fields that you do not need
- `.catch()` and `.default()` wrappers, because they widen the accepted input
- Union types and deeply nested objects
- Optional strings with no constraint. Use enums or formats where you can.

Anthropic changes its limits and does not publish all of them. For the current limits, read the Anthropic [structured outputs documentation](https://docs.claude.com/en/docs/build-with-claude/structured-outputs).

### Where validation runs

Validation on the server depends on the path:

- `await chat({ outputSchema })`: the engine validates the object with your Standard Schema when the run ends. A failure goes to the `onError` middleware hook, and the promise rejects.
- `chat({ outputSchema, stream: true })`: the engine does not validate. Read the object from `value.object` on the `structured-output.complete` event, or call `parseWithStandardSchema` on the raw text yourself.

On the client, the schema you give `useChat` is for TypeScript types and for the progressive parse of `partial`.

### Optional fields come back absent

Strict providers need every field to be required. So the engine sends each optional field as required and nullable, and the provider returns `null` for a missing optional field. Before you get the object, the engine undoes this change:

- An `.optional()` field that came back `null` is absent, which matches `T | undefined`.
- A `.nullable()` field keeps its `null`.

This applies to the awaited result and to `value.object` on the stream.

### Middleware

Middleware on `chat()` sees the agent loop and the final structured-output call. Chunks from that final call have `ctx.phase === "structuredOutput"`. `onFinish` fires once, at the end of the full run.

Some adapters return tool calls and the schema-constrained answer in one streaming request. On these adapters there is no separate final call:

- The engine adds `outputSchema` to the normal request and reads the object from the text of the last turn.
- The `"structuredOutput"` phase does not fire. Middleware sees the run through `"beforeModel"` and `"modelStream"`.
- `onStructuredOutputConfig` does not run.

Adapters with this combined mode:

- OpenAI (Chat Completions and Responses)
- Anthropic Claude 4.5 and newer
- Gemini 3.x
- Grok 4.x
- OpenRouter, when every routed model is in `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS`. See the [OpenRouter adapter](../adapters/openrouter.md#tools-and-structured-output-together).

Other adapters make a separate final call, and the `"structuredOutput"` phase fires. These include Anthropic 4.4 and older, Gemini 2.x, Grok 2 and 3, Groq, Ollama, and OpenRouter models outside that set.

To see the structured-output chunks, read `ctx.phase` in `onChunk`:

```ts
import type { ChatMiddleware } from "@tanstack/ai";
import { span } from "./span";

const tracing: ChatMiddleware = {
  name: "tracing",
  onChunk(ctx, chunk) {
    // Fires for chunks from the agent loop and from the final structured-output call.
    if ("type" in chunk) {
      span.addEvent("chunk", { phase: ctx.phase, type: chunk.type });
    }
  },
};
```

To change the JSON Schema before the provider call, use `onStructuredOutputConfig`:

```ts
import type { ChatMiddleware } from "@tanstack/ai";
import { sharedDefs } from "./schema-defs";

const injectDefs: ChatMiddleware = {
  name: "inject-defs",
  onStructuredOutputConfig(_ctx, config) {
    return {
      outputSchema: { ...config.outputSchema, $defs: { ...sharedDefs } },
    };
  },
};
```

For all hooks, see [Middleware](../advanced/middleware.md).
