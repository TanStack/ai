---
title: Runtime Context
id: runtime-context
order: 2
description: "Pass typed runtime dependencies to TanStack AI tools and middleware without serializing them to the model or AG-UI protocol context."
keywords:
  - tanstack ai
  - runtime context
  - typed context
  - tools context
  - middleware context
  - ag-ui context
---

Runtime context is application state you pass to tool implementations and middleware. Use it for request-scoped or client-local dependencies such as authenticated users, database clients, tenancy, feature flags, audit loggers, or browser services.

Runtime context is not prompt context and is not the AG-UI `RunAgentInput.context` field. It is never sent to the model automatically.

## How Type Safety Works

Runtime context is checked from the point of view of the code that consumes it. Tools and middleware declare the context shape they need, and `chat()`, `ChatClient`, and framework hooks check that the `context` value you pass satisfies those requirements.

The source of truth is:

- `toolDefinition(...).server<TContext>(...)` for server tools.
- `toolDefinition(...).client<TContext>(...)` for client tools.
- `ChatMiddleware<TContext>` for middleware.

This means the context value is the implementation detail you provide at runtime, while tools and middleware are the contract. TanStack AI infers the required context from every typed tool and middleware in the call, merges those requirements, and checks your `context` option against the result.

```typescript
import { chat, toolDefinition, type ChatMiddleware } from "@tanstack/ai";

type UserContext = {
  userId: string;
};

type TenantContext = {
  tenantId: string;
};

const currentUserTool = toolDefinition({
  name: "current_user",
  description: "Read the current user",
}).server<UserContext>((_input, ctx) => {
  return { userId: ctx.context.userId };
});

const tenantMiddleware: ChatMiddleware<TenantContext> = {
  name: "tenant",
  onStart(ctx) {
    console.log(ctx.context.tenantId);
  },
};

chat({
  adapter,
  messages,
  tools: [currentUserTool],
  middleware: [tenantMiddleware],
  context: {
    userId: "user_123",
    tenantId: "tenant_456",
  },
});
```

In this example, the tool requires `UserContext` and the middleware requires `TenantContext`, so the `context` value must satisfy both. If you remove `tenantId`, TypeScript reports an error because `tenantMiddleware` declared that it needs it.

This is intentional. The `context` object alone should not decide what tools and middleware are allowed to read. The consumers define their requirements, and the call site proves that it supplied them. Untyped tools and middleware still work; they receive `unknown` context and do not force a `context` option.

This inference also works when reusable tools or middleware are declared outside the `chat()` call and passed in as arrays. A consumer can opt into optional runtime context by declaring `TContext | undefined`; then the `context` option can be omitted when all typed consumers accept `undefined`. If a context value is provided, it still has to satisfy every typed consumer.

The same rule applies on the client:

```typescript
import { clientTools } from "@tanstack/ai-client";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { toolDefinition } from "@tanstack/ai";

type ClientRuntimeContext = {
  currentTabId: string;
};

const inspectClientContext = toolDefinition({
  name: "inspect_client_context",
  description: "Inspect local browser context",
}).client<ClientRuntimeContext & { mode: "debug" }>((_input, ctx) => {
  return {
    tabId: ctx.context.currentTabId,
    mode: ctx.context.mode,
  };
});

useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools: clientTools(inspectClientContext),
  context: {
    currentTabId: "settings",
    mode: "debug",
  },
});
```

Because the client tool declares `ClientRuntimeContext & { mode: "debug" }`, `useChat()` requires a `context` value with both `currentTabId` and the literal `mode: "debug"`.

## Server Runtime Context

Define the context type once, use it in server tools and middleware, then pass the matching `context` value to `chat()`.

```typescript
import {
  chat,
  toServerSentEventsResponse,
  toolDefinition,
  type ChatMiddleware,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

type AppContext = {
  userId: string;
  tenantId: string;
  db: {
    notes: {
      findMany(args: { userId: string; tenantId: string }): Promise<Array<{ title: string }>>;
    };
  };
};

const listNotes = toolDefinition({
  name: "list_notes",
  description: "List notes for the current user",
  inputSchema: z.object({}),
  outputSchema: z.array(z.object({ title: z.string() })),
}).server<AppContext>(async (_input, ctx) => {
  return ctx.context.db.notes.findMany({
    userId: ctx.context.userId,
    tenantId: ctx.context.tenantId,
  });
});

const auditMiddleware: ChatMiddleware<AppContext> = {
  name: "audit",
  onStart(ctx) {
    console.log("chat started", {
      requestId: ctx.requestId,
      userId: ctx.context.userId,
      tenantId: ctx.context.tenantId,
    });
  },
};

export async function POST(request: Request) {
  const { messages } = await request.json();
  const user = await requireUser(request);

  const stream = chat({
    adapter: openaiText("gpt-4o"),
    messages,
    tools: [listNotes],
    middleware: [auditMiddleware],
    context: {
      userId: user.id,
      tenantId: user.tenantId,
      db,
    },
  });

  return toServerSentEventsResponse(stream);
}
```

When any tool or middleware in a `chat()` call declares a concrete context type, TypeScript checks the `context` value against that type. Existing untyped tools and middleware continue to work; their `ctx.context` type remains `unknown`.

## Client Runtime Context

Client runtime context is local to `ChatClient` and framework hooks. It is passed to client tool implementations and is not serialized to the server.

```typescript
import { createChatClientOptions, clientTools } from "@tanstack/ai-client";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { toolDefinition } from "@tanstack/ai";

type ClientContext = {
  currentTabId: string;
  toast(message: string): void;
};

const notifyUser = toolDefinition({
  name: "notify_user",
  description: "Show a notification in the current browser tab",
}).client<ClientContext>((_input, ctx) => {
  ctx.context.toast(`Updated tab ${ctx.context.currentTabId}`);
  return { ok: true };
});

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools: clientTools(notifyUser),
  context: {
    currentTabId: "settings",
    toast: (message) => window.alert(message),
  },
});

const chat = useChat(chatOptions);
```

Use client context for local dependencies only. Do not put values there expecting the server to receive them.

## Client-to-Server Handoff

To send serializable client data to the server, use `forwardedProps`, validate it in your route, and explicitly map it into the server runtime context.

```typescript
// Client
useChat({
  connection: fetchServerSentEvents("/api/chat"),
  forwardedProps: {
    tenantId: selectedTenantId,
  },
  context: clientRuntimeContext,
});
```

```typescript
// Server
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";

type AppContext = {
  userId: string;
  tenantId: string;
};

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const user = await requireUser(request);

  const tenantId =
    typeof params.forwardedProps.tenantId === "string"
      ? params.forwardedProps.tenantId
      : user.defaultTenantId;

  const stream = chat({
    adapter,
    messages: params.messages,
    tools,
    context: {
      userId: user.id,
      tenantId,
    } satisfies AppContext,
  });

  return toServerSentEventsResponse(stream);
}
```

Treat `forwardedProps` as client-controlled input. Validate and allowlist every field before using it to build server runtime context.

## AG-UI Context

AG-UI also defines `RunAgentInput.context`, usually as protocol-level context entries for interoperable agents. TanStack AI surfaces that field through `chatParamsFromRequest`, but it is separate from `chat({ context })`.

TanStack AI does not automatically copy AG-UI `params.context` into runtime context. If you want to use AG-UI context values, validate and map them yourself:

```typescript
const params = await chatParamsFromRequest(request);

const stream = chat({
  adapter,
  messages: params.messages,
  tools,
  context: buildRuntimeContextFrom(params.context),
});
```
