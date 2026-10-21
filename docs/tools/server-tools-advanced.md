---
title: "Server Tools: Advanced"
id: server-tools-advanced
order: 3
description: "Input checks and repair, JSON Schema tools, progress events, long-running hosts, and file layout for TanStack AI server tools."
keywords:
  - tanstack ai
  - server tools
  - repairToolInput
  - json schema
  - emitCustomEvent
  - tool validation
---

This page is for when your [server tool](./server-tools) works and you need more control. Each section stands alone.

## How `chat()` checks the input

The `inputSchema` checks the input right before the tool runs:

- The check runs after approval edits and after middleware `onBeforeToolCall`. An approval edit that does not fit the schema stops the resume with an `invalid-edited-args` error. A middleware change that does not fit becomes a tool error.
- An async validator is awaited.
- The tool gets the output of the schema, so a transform such as `z.string().transform(Number)` applies once.

Malformed JSON arguments and failed input checks (Standard Schema or JSON Schema) become tool errors. The tool does not run. The agent loop can send the error back to the model, so the model can correct the call. This also applies to Chat Completions tools with no required input fields.

For OpenAI-compatible providers, an omitted `.optional()` field is absent when your tool runs. A `.nullable()` field keeps `null`.

### The built-in repair

Models often send a value with the wrong type, such as `"5"` for a number. Before the check fails the call, it repairs these values against the schema:

| The model sends | The schema wants | The tool gets |
| --- | --- | --- |
| `"5"` | `number` or `integer` | `5` |
| `"true"` | `boolean` | `true` |
| `5` | `string` | `"5"` |
| `null` for an optional field | a type with no `null` | no field |
| `null` for a required field | `string`, `number`, or `boolean` | `""`, `0`, or `false` |

- A JSON Schema tool, and an MCP tool, gets the repair when its input fails the check. A valid input runs as it is.
- A Standard Schema that can export JSON Schema (Zod, ArkType, Valibot) runs first as written. If it fails, the input is repaired and the schema runs again. If it still fails, the error shows the issues of the first run.
- An input that cannot be repaired, such as `"many"` for a number, becomes a tool error.

## Turn off or replace the repair

Sometimes the built-in repair is wrong for your tool. Maybe your tool moves money, and a `null` must never turn into `0`. Or maybe your model makes the same odd mistake every time, and you know the fix. Pass `repairToolInput` to `chat()`.

Turn the repair off, so a bad input always goes back to the model as an error:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { transferFunds } from "./tools";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    tools: [transferFunds],
    repairToolInput: false,
  });

  return toServerSentEventsResponse(stream);
}
```

Or write your own fix. Say the model keeps sending `"limit": "all"` to `search_products`. Map it to a number:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { searchProducts } from "./tools";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    tools: [searchProducts],
    repairToolInput: ({ tool, input }) => {
      if (
        tool.name === "search_products" &&
        typeof input === "object" &&
        input !== null &&
        "limit" in input &&
        input.limit === "all"
      ) {
        return { ...input, limit: 100 };
      }
      return undefined;
    },
  });

  return toServerSentEventsResponse(stream);
}
```

How your function works:

- It runs only when an input fails the check. A valid input never gets to it.
- It replaces the built-in repair. A `"5"` stays a string unless your function changes it.
- It gets `tool`, `toolCall`, `input`, and `error` (the validation error).
- Return the new input, and the check runs again. If that check fails, the model gets the original error.
- Return `undefined` to send the original error to the model. If your function throws, the model gets the thrown message.

The option works the same for Standard Schema tools, JSON Schema tools, and MCP tools.

A client tool, or a tool that waits for approval, is checked two times: once before it goes out, and once when it comes back. So your function can run two times for one call.

## Use a JSON Schema

Do you already have JSON Schema definitions? Pass them as `inputSchema` and `outputSchema`:

```typescript
import { toolDefinition } from "@tanstack/ai";
import type { JSONSchema } from "@tanstack/ai";
import { db } from "./db";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    userId: {
      type: "string",
      description: "The user ID to look up",
    },
  },
  required: ["userId"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
  },
  required: ["name", "email"],
};

const getUserDataDef = toolDefinition({
  name: "get_user_data",
  description: "Get user information from the database",
  inputSchema,
  outputSchema,
});

// With a raw JSON Schema, args is typed as `unknown`. Narrow it before use.
const getUserData = getUserDataDef.server(async (args) => {
  if (typeof args !== "object" || args === null || !("userId" in args)) {
    throw new Error("Invalid input: expected a userId");
  }
  const user = await db.users.findUnique({ where: { id: String(args.userId) } });
  return { name: user.name, email: user.email };
});
```

TypeScript cannot get types from a JSON Schema, so `args` is `unknown`. A Zod schema gives you the types too.

The JSON Schema checks each call before the tool runs. MCP tools get the same check. If the input does not fit, the call gets a tool error, and the error names each failed field:

```text
Input validation failed for tool get_user_data: #: Instance does not have required property "userId".
```

- The check uses the draft that `$schema` names: draft-04, draft-07, 2019-09, or 2020-12. With no `$schema`, it uses 2020-12.
- OpenAPI 3.0 schemas work. `nullable: true` lets the field be `null`. A boolean `exclusiveMinimum` or `exclusiveMaximum` works too.
- The check does not test `format` (such as `uri` or `email`). A `format` only describes the value.
- The check does not compile code, so it also runs on Cloudflare Workers.

## Stream progress while a tool runs

The second argument of a `.server()` function is the `ToolExecutionContext`:

- `context`: your runtime context from `chat({ context })`.
- `toolCallId`: the ID of this tool call.
- `threadId`: the thread id of the chat run. Use it to keep tool state for each conversation.
- `abortSignal`: aborts when the run aborts. Pass it to long work, so the work stops too.
- `emitCustomEvent`: sends a custom event to the client while the tool runs.

Use `emitCustomEvent` to show progress:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

type ImportContext = {
  db: {
    read(source: string): Promise<unknown[]>;
    write(rows: unknown[]): Promise<void>;
  };
};

const importData = toolDefinition({
  name: "import_data",
  description: "Import data from a source",
  inputSchema: z.object({ source: z.string() }),
  outputSchema: z.object({ imported: z.number() }),
}).server<ImportContext>(async (input, { context, emitCustomEvent }) => {
  emitCustomEvent("progress", { step: 1, total: 3 });
  const rows = await context.db.read(input.source);

  emitCustomEvent("progress", { step: 2, total: 3 });
  await context.db.write(rows);

  emitCustomEvent("progress", { step: 3, total: 3 });
  return { imported: rows.length };
});
```

Each `emitCustomEvent` call flushes through durability at once, so the client can show progress while the tool still runs. Pass `{ batch: true }` only for a high-volume stream. To read the events on the client, see [Custom Events](../protocol/custom-events).

## Support a host that runs long sessions

Some hosts run `chat()` for a long session. Such a host can restart a run after a crash, or move a slow tool call to the background. Two fields let your tool work with that host. `chat()` alone does not use them.

- `replay` tells the host if it can run the tool again after a crash.
  - `'safe'` means the host can run it again. Use it for a read or another call that you can repeat.
  - When a second run is not safe, omit the field or set `'never'`. The host then writes a note for the model.
  - `chat()` does not read `replay`.
- `detach` is set by the host when it can move this call to the background.
  - Pass the work to `detach`, and race that promise with the work.
  - When the host moves the call, `detach` resolves to a short string. The work keeps running. When the work ends, the host tells the model the result.
  - An object `outputSchema` rejects that string.
  - `chat()` does not set `detach`.

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

declare function runBuild(target: string): Promise<string>;

const build = toolDefinition({
  name: "build",
  description: "Build a target",
  inputSchema: z.object({ target: z.string() }),
  replay: "safe",
}).server(async ({ target }, ctx) => {
  const work = runBuild(target);
  return ctx?.detach ? Promise.race([work, ctx.detach(work)]) : work;
});
```

## Keep definitions and implementations in separate files

Put the definitions in a shared file. Then the server and the client can import the same definitions:

```typescript ignore
// tools/definitions.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const getUserDataDef = toolDefinition({
  name: "get_user_data",
  description: "Get user information",
  inputSchema: z.object({
    userId: z.string(),
  }),
  outputSchema: z.object({
    name: z.string(),
    email: z.string(),
  }),
});

export const searchProductsDef = toolDefinition({
  name: "search_products",
  description: "Search products",
  inputSchema: z.object({
    query: z.string(),
  }),
});

// tools/server.ts
import { getUserDataDef, searchProductsDef } from "./definitions";
import { db } from "@/lib/db";

export const getUserData = getUserDataDef.server(async ({ userId }) => {
  const user = await db.users.findUnique({ where: { id: userId } });
  return { name: user.name, email: user.email };
});

export const searchProducts = searchProductsDef.server(async ({ query }) => {
  const products = await db.products.search(query);
  return products;
});

// api/chat/route.ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { getUserData, searchProducts } from "@/tools/server";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages,
  tools: [getUserData, searchProducts],
});
```

## Tips for good server tools

1. **Keep tools focused.** One tool does one job.
2. **Write clear descriptions.** The model reads them to pick a tool.
3. **Return errors as data.** Give the model a message that it can act on.
4. **Keep secrets on the server.** API keys stay in `.server()` code and never go to the client.
5. **Prefer a Zod schema.** It checks every call and also gives you types.
