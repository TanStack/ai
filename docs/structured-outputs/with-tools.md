---
title: Structured Outputs With Tools
id: structured-outputs-with-tools
order: 5
description: "Combine outputSchema with tools so the agent loop runs first (calling tools as needed) and then returns a validated typed object. Includes the pause / resume flow for tool-approval gates and client-tool invocations inside a structured run."
keywords:
  - tanstack ai
  - structured outputs
  - tools
  - agent loop
  - tool approval
  - client tools
  - outputSchema tools
---

You want the agent to use tools to gather information, then return a structured object summarizing what it found. "Recommend a product for a developer" → the loop calls `getProductPrice`, hits an inventory API, then returns `{ productName, currentPrice, reason }` validated against your schema. The structured response only fires after every tool resolves.

This page covers the combined `outputSchema` + `tools` shape, including the pause/resume points (server-tool approval prompts, client-tool invocations) that can land mid-run before the structured object arrives.

> **Note:** If you're not yet familiar with how tools work in TanStack AI, read [Tool Architecture](../tools/tool-architecture) and [Server Tools](../tools/server-tools) first. The patterns here build on the regular agent-loop flow — `outputSchema` just adds a final terminal event.

## Non-streaming: tools first, then structured object

The simplest shape: `await chat({ tools, outputSchema })`. The agent loop runs to completion (every tool resolved, every approval responded to), then the model produces the structured object. The promise resolves with the validated, typed result.

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getProductPrice = toolDefinition({
  name: "get_product_price",
  description: "Get the current price of a product",
  inputSchema: z.object({ productId: z.string() }),
}).server(async ({ input }) => {
  return { price: 29.99, currency: "USD" };
});

const RecommendationSchema = z.object({
  productName: z.string(),
  currentPrice: z.number(),
  reason: z.string(),
});

const recommendation = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Recommend a product for a developer" }],
  tools: [getProductPrice],
  outputSchema: RecommendationSchema,
});

recommendation.productName;  // string — fully typed
recommendation.currentPrice; // number
recommendation.reason;       // string
```

The agent decides when to call `get_product_price`, executes the tool, integrates the result into its reasoning, and only then produces the final structured response. You see the validated object; the tool calls happen behind the scenes.

## Streaming: lifecycle events before the structured payload

Pass `stream: true` and the wire format changes — the client now sees tool-call events as they happen, _then_ the structured-output stream emits its terminal event. The lifecycle ordering is:

1. `RUN_STARTED`
2. (Agent loop) `TOOL_CALL_START` → `TOOL_CALL_ARGS` → `TOOL_CALL_END` → `TOOL_CALL_RESULT`, possibly repeating for multiple tool calls or iterations
3. `structured-output.start` (once the model begins emitting the JSON response)
4. `TEXT_MESSAGE_CONTENT` deltas (the JSON itself)
5. `structured-output.complete` (validated payload)
6. `RUN_FINISHED`

`useChat`'s `partial` stays `{}` and `final` stays `null` while step 2 is running — the structured stream hasn't started yet. Once step 3 fires, `partial` begins filling in; on step 5, `final` snaps.

The tool-call parts land on the assistant message exactly as they would in a normal streaming chat. Render them however you'd render tool calls outside a structured-output run.

## Server tools that need approval

A server tool registered with `needsApproval: true` doesn't execute automatically — the agent loop pauses, the queued tool-call lands on the assistant message as a `ToolCallPart` with `state === "approval-requested"`, and the loop waits for you to call `addToolApprovalResponse({ id, approved })` from the hook return. The structured-output stream only takes over once approval is granted (or denied and the loop resumes).

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage, partial, final, addToolApprovalResponse } =
  useChat({
    connection: fetchServerSentEvents("/api/recommend"),
    outputSchema: RecommendationSchema,
    tools: [sendEmail], // server tool with needsApproval: true
  });

const last = messages.at(-1);

return (
  <>
    {last?.parts.map((part, i) => {
      // Surface approval prompts inline.
      if (
        part.type === "tool-call" &&
        part.state === "approval-requested" &&
        part.approval
      ) {
        return (
          <ApprovalPrompt
            key={i}
            part={part}
            onApprove={() =>
              addToolApprovalResponse({ id: part.approval!.id, approved: true })
            }
            onDeny={() =>
              addToolApprovalResponse({ id: part.approval!.id, approved: false })
            }
          />
        );
      }
      if (part.type === "thinking") return <ReasoningView key={i} text={part.content} />;
      if (part.type === "tool-call") return <ToolCallView key={i} part={part} />;
      return null;
    })}

    {/* The structured payload — fills in once tools resolve. */}
    <StructuredView data={final ?? partial} />
  </>
);
```

While the approval is pending, `partial` stays at its last value (which is `{}` on a first run) and `final` stays `null`. As soon as the user approves (or denies and the loop continues), the agent loop resumes, the structured stream runs, and `partial` / `final` populate.

The full server-tool approval pattern lives in [Tool Approval Flow](../tools/tool-approval). The only structured-output-specific note: the approval can land **before** the structured stream starts. That's why `partial` reads `{}` while you're staring at an approval prompt — there's no JSON yet.

## Client tools mid-run

Client tools (tools registered with an `execute` function on the client) are invoked the same way they would be in a normal chat. If you registered the tool with `execute`, the runtime runs it automatically and posts the result back — no extra code on your side.

If you want manual control, listen for `onToolCall` and respond with `addToolResult({ toolCallId, tool, output, state })`:

```tsx
const { addToolResult } = useChat({
  outputSchema: RecommendationSchema,
  tools: [lookupContact], // client tool, no `execute`
  connection: fetchServerSentEvents("/api/recommend"),
  onToolCall: async ({ toolCallId, toolName, input }) => {
    if (toolName === "lookup_contact") {
      const output = await runLookupOnClient(input);
      await addToolResult({
        toolCallId,
        tool: toolName,
        output,
        state: "output-available",
      });
    }
  },
});
```

The agent loop pauses on the `tool-input-available` custom event, your callback resolves, and the loop continues to the structured-output stream. See [Client Tools](../tools/client-tools) for the canonical pattern.

## Multi-turn + tools + structured output

Composes naturally. Every turn runs the agent loop (with any tool gates), then snaps a structured-output part on that turn's assistant message. The next turn sees the prior recipe (or recommendation, or report) as assistant content and can iterate on it.

The only thing to be careful of: between `sendMessage()` and the first structured-output event, the latest turn has no `structured-output` part yet — your render loop's `m.parts.find(p => p.type === "structured-output")` returns `undefined`. Render a "streaming…" placeholder when `isLoading && messages[last]?.role === "user"` to cover that gap. See [Multi-Turn Chat](./multi-turn) for the full pattern.
