---
title: Runtime Context
id: runtime-context
order: 2
description: "Pass typed runtime deps to tools and middleware without sending them to the model or AG-UI context."
keywords:
  - tanstack ai
  - runtime context
  - typed context
  - tools context
  - middleware context
  - ag-ui context
---

If tools/middleware need request-local deps (user, db, toast) → pass `context` on `chat()` / `useChat`. It is **not** prompt context and **not** AG-UI `RunAgentInput.context`. Never sent to the model automatically.

## Type safety

Consumers declare needs; call site must satisfy the merge:

1. `toolDefinition(...).server<TContext>(...)` / `.client<TContext>(...)`
2. `ChatMiddleware<TContext>`
3. `chat()` / hooks check `context` against every typed consumer

Untyped consumers get `unknown` and do not force `context`. Optional: declare `TContext | undefined` so `context` may be omitted.

```typescript
import {
  chat,
  toServerSentEventsResponse,
  toolDefinition,
  type ChatMiddleware,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

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

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: [currentUserTool],
    middleware: [tenantMiddleware],
    context: {
      userId: "user_123",
      tenantId: "tenant_456",
    },
  });
  return toServerSentEventsResponse(stream);
}
```

Client tools force client `context` the same way:

```typescript
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
  tools: [inspectClientContext],
  context: {
    currentTabId: "settings",
    mode: "debug",
  },
});
```

## Server runtime context

```typescript
import {
  chat,
  toServerSentEventsResponse,
  toolDefinition,
  type ChatMiddleware,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";
import { requireUser, db } from "./auth";

type AppContext = {
  userId: string;
  tenantId: string;
  db: {
    notes: {
      findMany(args: {
        userId: string;
        tenantId: string;
      }): Promise<Array<{ title: string }>>;
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
    adapter: openaiText("gpt-5.5"),
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

## Client runtime context

Local to `ChatClient` / hooks — not serialized to the server.

```typescript
import { createChatClientOptions } from "@tanstack/ai-client";
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
  tools: [notifyUser],
  context: {
    currentTabId: "settings",
    toast: (message) => window.alert(message),
  },
});

const chat = useChat(chatOptions);
```

## Client → server handoff

Serializable data → `forwardedProps`. Validate on the server; map into server `context` yourself.

**Client:**

```typescript
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

useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools: [notifyUser],
  forwardedProps: {
    tenantId: "tenant_456",
  },
  context: {
    currentTabId: "settings",
    toast: (message) => window.alert(message),
  },
});
```

**Server:**

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { requireUser } from "./auth";
import { serverTools } from "./tools";

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
    adapter: openaiText("gpt-5.5"),
    messages: params.messages,
    tools: serverTools,
    context: {
      userId: user.id,
      tenantId,
    } satisfies AppContext,
  });

  return toServerSentEventsResponse(stream);
}
```

Treat `forwardedProps` as client-controlled: validate and allowlist before use.

## AG-UI context

`RunAgentInput.context` is protocol metadata via `chatParamsFromRequest` (`params.aguiContext`; `params.context` is a deprecated alias). TanStack AI does **not** auto-copy it into runtime `context` — map it yourself:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { buildRuntimeContextFrom } from "./context";
import { serverTools } from "./tools";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages: params.messages,
    tools: serverTools,
    context: buildRuntimeContextFrom(params.aguiContext),
  });

  return toServerSentEventsResponse(stream);
}
```
