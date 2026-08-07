---
title: Structured Outputs With Tools
id: structured-outputs-with-tools
order: 5
description: "Run tools first, then return a validated object — approvals and client tools mid structured run."
keywords:
  - tanstack ai
  - structured outputs
  - tools
  - agent loop
  - tool approval
  - client tools
  - outputSchema tools
---

# Structured Outputs With Tools

If the agent must call tools then return a typed object → pass both `tools` and `outputSchema`. Structured output runs after the agent loop finishes.

Tools primer: [Tool Architecture](../tools/tool-architecture) · [Server Tools](../tools/server-tools).

## Non-streaming

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getProductPrice = toolDefinition({
  name: "get_product_price",
  description: "Get the current price of a product",
  inputSchema: z.object({ productId: z.string() }),
}).server(async ({ productId }) => {
  return { price: 29.99, currency: "USD" };
});

const RecommendationSchema = z.object({
  productName: z.string(),
  currentPrice: z.number(),
  reason: z.string(),
});

const recommendation = await chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Recommend a product for a developer" }],
  tools: [getProductPrice],
  outputSchema: RecommendationSchema,
});

recommendation.productName;
recommendation.currentPrice;
recommendation.reason;
```

## Streaming order

1. `RUN_STARTED`
2. Tool events (`TOOL_CALL_*` / results; may loop)
3. `structured-output.start` → JSON deltas → `structured-output.complete`
4. `RUN_FINISHED`

While tools run, `partial` is `{}` and `final` is `null`. Tool parts land on messages like a normal chat.

## Tool approval mid-run

`needsApproval` pauses before structured JSON. Respond with approval APIs; then the loop continues and structured stream starts.

```tsx ignore
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { RecommendationSchema } from "./api/recommend";
import { sendEmail } from "./tools";

const { messages, sendMessage, partial, final, addToolApprovalResponse } =
  useChat({
    connection: fetchServerSentEvents("/api/recommend"),
    outputSchema: RecommendationSchema,
    tools: [sendEmail], // needsApproval: true
  });

const last = messages.at(-1);

return (
  <>
    {last?.parts.map((part, i) => {
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
    <StructuredView data={final ?? partial} />
  </>
);
```

During approval, `partial` stays `{}`. Full approval UX: [Tool Approval Flow](../tools/tool-approval). Prefer interrupts guide for native AG-UI path: [Tool Approval](../interrupts/tool-approval).

## Client tools mid-run

Register `.client()` tools on `useChat({ tools })` — they run automatically; no `onToolCall`.

```tsx
import { toolDefinition } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";
import { runLookupOnClient } from "./client-utils";
import { RecommendationSchema } from "./api/recommend";

const lookupContact = toolDefinition({
  name: "lookup_contact",
  description: "Find a contact by name",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ email: z.string(), phone: z.string() }),
}).client((input) => runLookupOnClient(input));

const { messages, sendMessage, partial, final } = useChat({
  outputSchema: RecommendationSchema,
  tools: [lookupContact],
  connection: fetchServerSentEvents("/api/recommend"),
});
```

While the client tool runs, structured stream has not started. Details: [Client Tools](../tools/client-tools).

## Multi-turn + tools

Each turn: agent loop (with any gates) → structured-output part on that assistant message. Between `sendMessage()` and the first structured event, the latest turn may have no structured-output part — show a placeholder when `isLoading` and last message is user. Full history pattern: [Multi-Turn](./multi-turn).
