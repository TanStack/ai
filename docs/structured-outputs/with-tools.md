---
title: Structured Outputs With Tools
id: structured-outputs-with-tools
order: 5
description: "Let the model call tools first, then return a typed object. Pass tools and outputSchema to the same chat() call, and handle tool approvals and client tools inside the run."
keywords:
  - tanstack ai
  - structured outputs
  - tools
  - agent loop
  - tool approval
  - client tools
  - outputSchema tools
---

The model can call tools, then return an object that matches `outputSchema`. The tool result is available before the object is filled.

Pass `tools` and `outputSchema` to the same `chat()` call.

New to tools? Read [Server Tools](../tools/server-tools) first.

## Quick setup

### 1. Define the tool and the schema

```typescript group=with-tools
// recommend.ts
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getProductPrice = toolDefinition({
  name: "get_product_price",
  description: "Get the current price of a product",
  inputSchema: z.object({ productId: z.string() }),
}).server(async ({ productId }) => {
  console.log(`Looking up ${productId}`);
  return { price: 29.99, currency: "USD" };
});

const RecommendationSchema = z.object({
  productName: z.string(),
  currentPrice: z.number(),
  reason: z.string(),
});
```

### 2. Pass both to `chat()`

Add this to the same file:

```typescript group=with-tools
const recommendation = await chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Recommend a product for a developer" }],
  threadId: "thread-1",
  tools: [getProductPrice],
  outputSchema: RecommendationSchema,
});

console.log(recommendation.productName, recommendation.currentPrice);
```

Run the file. You see `Looking up ...` first. Then the typed recommendation prints, with the price from the tool.

## How it works

1. The agent loop runs. The model calls `get_product_price`, and the engine runs it.
2. The loop continues until every tool has a result.
3. The model returns JSON that matches your schema.
4. The engine validates the object, and the promise resolves.

With `stream: true`, the client sees the events in this order:

1. `RUN_STARTED`
2. Tool events (`TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`). These can repeat for many calls.
3. `structured-output.start`, when the JSON begins
4. `TEXT_MESSAGE_CONTENT` deltas with the JSON
5. `structured-output.complete` with the full object
6. `RUN_FINISHED`

In `useChat`, `partial` stays `{}` and `final` stays `null` during step 2. `partial` starts to fill at step 3, and `final` is set at step 5. Tool-call parts land on the assistant message, the same as in a normal chat.

## Gate a tool behind an approval

A tool with `needsApproval: true` does not run until the user says yes. The run pauses, and the structured JSON starts only after the user answers.

Put the tool definition in a shared file:

```typescript
// tools/definitions.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const sendEmailDef = toolDefinition({
  name: "send_email",
  description: "Send an email to a recipient",
  inputSchema: z.object({ to: z.string(), subject: z.string() }),
  outputSchema: z.object({ sent: z.boolean() }),
  needsApproval: true,
});

export const ReportSchema = z.object({
  summary: z.string(),
  emailSent: z.boolean(),
});
```

On the server, forward `parentRunId` and `resume`. The answer of the user arrives in a second request, and `chat()` uses these fields to continue the paused run:

```typescript
// api/report.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

// The same definitions as tools/definitions.ts. In your app, import them from that file.
const sendEmailDef = toolDefinition({
  name: "send_email",
  description: "Send an email to a recipient",
  inputSchema: z.object({ to: z.string(), subject: z.string() }),
  outputSchema: z.object({ sent: z.boolean() }),
  needsApproval: true,
});

const ReportSchema = z.object({
  summary: z.string(),
  emailSent: z.boolean(),
});

const sendEmail = sendEmailDef.server(async ({ to, subject }) => {
  console.log(`Sending "${subject}" to ${to}`);
  return { sent: true };
});

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    parentRunId: params.parentRunId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [sendEmail],
    outputSchema: ReportSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

On the client, show each pending approval from `interrupts`:

```tsx
// app/report.tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// The same definitions as tools/definitions.ts. In your app, import them from that file.
const sendEmailDef = toolDefinition({
  name: "send_email",
  description: "Send an email to a recipient",
  inputSchema: z.object({ to: z.string(), subject: z.string() }),
  outputSchema: z.object({ sent: z.boolean() }),
  needsApproval: true,
});

const ReportSchema = z.object({
  summary: z.string(),
  emailSent: z.boolean(),
});

export function Report() {
  const { sendMessage, interrupts, resuming, partial, final } = useChat({
    connection: fetchServerSentEvents("/api/report"),
    threadId: "support-chat",
    tools: [sendEmailDef],
    outputSchema: ReportSchema,
  });

  return (
    <div>
      <button
        onClick={() =>
          void sendMessage("Email ada@example.com a hello, then report back.")
        }
      >
        Start
      </button>

      {interrupts.map((interrupt) =>
        interrupt.kind === "tool-approval" ? (
          <div key={interrupt.id}>
            <p>Run {interrupt.toolName}?</p>
            <button
              disabled={!interrupt.canResolve || resuming}
              onClick={() => interrupt.resolveInterrupt(true)}
            >
              Approve
            </button>
            <button
              disabled={!interrupt.canResolve || resuming}
              onClick={() => interrupt.resolveInterrupt(false)}
            >
              Deny
            </button>
          </div>
        ) : null,
      )}

      <p>{(final ?? partial).summary ?? "Waiting..."}</p>
    </div>
  );
}
```

Click Start, then Approve. The server logs the email, and the summary fills in. While the approval waits, `partial` stays `{}` because no JSON exists yet.

For the full approval flow, see [Tool Approval](../tools/tool-approval).

## Run a client tool inside the run

A client tool runs in the browser. When the model calls it, the run pauses. The browser runs your `.client()` function and sends the result back. Then the loop continues into the structured JSON. You do not need an `onToolCall` option.

Pass the definition to `chat()` on the server, the same way as in [Client Tools](../tools/client-tools). On the client, add the `.client()` implementation to `useChat`:

```tsx
import { toolDefinition } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";
import { ReportSchema } from "../tools/definitions";

const lookupContactDef = toolDefinition({
  name: "lookup_contact",
  description: "Find a contact by name in the local address book",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ email: z.string() }),
});

const lookupContact = lookupContactDef.client((input) => {
  const email = localStorage.getItem(`contact:${input.name}`) ?? "";
  return { email };
});

export function useReport() {
  return useChat({
    connection: fetchServerSentEvents("/api/report"),
    threadId: "support-chat",
    tools: [lookupContact],
    outputSchema: ReportSchema,
  });
}
```

While the client tool runs, `partial` stays `{}` and `final` stays `null`. When `.client()` returns, the loop continues, and `partial` and `final` fill in.

The server ends the paused run with an internal `client-tool-execution` interrupt. This interrupt is not in the public `interrupts` array. The client sends the tool output in a resume batch.

## Advanced

### Combined mode: one request for tools and schema

Some adapters return tool calls and the schema-constrained answer in one streaming request. On these adapters, `chat({ tools, outputSchema, stream: true })` makes no extra final call:

- OpenAI
- Anthropic Claude 4.5 and newer
- Gemini 3.x
- Grok 4.x
- [OpenRouter on those same upstream models](../adapters/openrouter.md#tools-and-structured-output-together)

The React chat example has a live OpenRouter page at `/generations/openrouter-combined`.

Other adapters make a separate final call after the agent loop. On that path, the loop can also finish a plain-text assistant message before `structured-output.start`. That message and the structured-output message stay separate. In combined mode, the JSON and its part are on one assistant message.

For how this affects middleware, see [Middleware](./overview#middleware).

### Harness agents

Coding agents in a sandbox (Claude Code, Codex, OpenCode, Grok Build) run native tools and the schema on the same turn. They do not pause for TanStack tool approvals or client tools. See [Harness Agents](./harnesses).

### Multi-turn with tools

Each turn runs the agent loop, with any approvals, and then adds a structured-output message. The next turn sees the earlier objects as assistant content. On the separate-final-call path, the plain-text message from the loop can also stay before each structured message.

Between `sendMessage()` and the first structured event, the latest turn has no `structured-output` part, so `find()` returns `undefined`. To show a placeholder, check `isLoading` and whether the last message is from the user. See [Multi-Turn Chat](./multi-turn).
