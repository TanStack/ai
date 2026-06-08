---
name: ai-core/tool-calling
description: >
  Isomorphic tool system: toolDefinition() with Zod schemas,
  .server() and .client() implementations, passing tools to both
  chat() on server and useChat/clientTools on client, tool approval
  flows with needsApproval and addToolApprovalResponse(), lazy tool
  discovery with lazy:true, rendering ToolCallPart and ToolResultPart
  in UI.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/tools/tools.md'
  - 'TanStack/ai:docs/tools/server-tools.md'
  - 'TanStack/ai:docs/tools/client-tools.md'
  - 'TanStack/ai:docs/tools/tool-approval.md'
  - 'TanStack/ai:docs/tools/lazy-tool-discovery.md'
---

# Tool Calling

This skill builds on ai-core. Read it first for critical rules.

## Setup

Complete end-to-end example: shared definition, server tool, client tool, server route, React client.

```typescript
// tools/definitions.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const getProductsDef = toolDefinition({
  name: 'get_products',
  description: 'Search for products in the catalog',
  inputSchema: z.object({
    query: z.string().meta({ description: 'Search keyword' }),
    limit: z.number().optional().meta({ description: 'Max results' }),
  }),
  outputSchema: z.object({
    products: z.array(
      z.object({ id: z.string(), name: z.string(), price: z.number() }),
    ),
  }),
})

export const updateCartUIDef = toolDefinition({
  name: 'update_cart_ui',
  description: 'Update the shopping cart UI with item count',
  inputSchema: z.object({ itemCount: z.number(), message: z.string() }),
  outputSchema: z.object({ displayed: z.boolean() }),
})
```

```typescript
// tools/server.ts
import { getProductsDef } from './definitions'

export const getProducts = getProductsDef.server(async ({ query, limit }) => {
  const results = await db.products.search(query, { limit: limit ?? 10 })
  return {
    products: results.map((p) => ({ id: p.id, name: p.name, price: p.price })),
  }
})
```

```typescript
// api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { getProducts } from '@/tools/server'
import { updateCartUIDef } from '@/tools/definitions'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    tools: [getProducts, updateCartUIDef], // server tool + client definition
  })
  return toServerSentEventsResponse(stream)
}
```

```typescript
// app/chat.tsx
import {
  useChat,
  fetchServerSentEvents,
  clientTools,
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-react";
import { updateCartUIDef } from "@/tools/definitions";
import { useState } from "react";

function ChatPage() {
  const [cartCount, setCartCount] = useState(0);

  const updateCartUI = updateCartUIDef.client((input) => {
    setCartCount(input.itemCount);
    return { displayed: true };
  });

  const tools = clientTools(updateCartUI);
  const chatOptions = createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools,
  });
  type Messages = InferChatMessages<typeof chatOptions>;

  const { messages, sendMessage } = useChat(chatOptions);

  return (
    <div>
      <span>Cart: {cartCount}</span>
      {(messages as Messages).map((msg) => (
        <div key={msg.id}>
          {msg.parts.map((part) => {
            if (part.type === "text") return <p>{part.content}</p>;
            if (part.type === "tool-call") {
              return <div key={part.id}>Tool: {part.name} ({part.state})</div>;
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

## Core Patterns

### Pattern 1: Server-Only Tool

Define with `toolDefinition()`, implement with `.server()`, pass to `chat({ tools })`.
The server executes it automatically. The client never runs code for this tool.

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getUserDataDef = toolDefinition({
  name: 'get_user_data',
  description: 'Look up user by ID',
  inputSchema: z.object({
    userId: z.string().meta({ description: "The user's ID" }),
  }),
  outputSchema: z.object({ name: z.string(), email: z.string() }),
})

const getUserData = getUserDataDef.server(async ({ userId }) => {
  const user = await db.users.findUnique({ where: { id: userId } })
  return { name: user.name, email: user.email }
})

// In your route handler:
const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools: [getUserData],
})
```

### Pattern 2: Client-Only Tool

Pass the bare definition (no `.server()`) to `chat({ tools })` so the LLM knows
about it. Pass the `.client()` implementation to `useChat` via `clientTools()`.

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const showNotificationDef = toolDefinition({
  name: 'show_notification',
  description: 'Display a toast notification to the user',
  inputSchema: z.object({
    message: z.string(),
    type: z.enum(['success', 'error', 'info']),
  }),
  outputSchema: z.object({ shown: z.boolean() }),
})
```

Server -- pass definition only (no execute function):

```typescript
const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools: [showNotificationDef],
})
```

Client -- pass `.client()` implementation:

```typescript
import {
  useChat,
  fetchServerSentEvents,
  clientTools,
  createChatClientOptions,
} from "@tanstack/ai-react";
import { showNotificationDef } from "@/tools/definitions";
import { useState } from "react";

function ChatPage() {
  const [toast, setToast] = useState<string | null>(null);

  const showNotification = showNotificationDef.client((input) => {
    setToast(input.message);
    setTimeout(() => setToast(null), 3000);
    return { shown: true };
  });

  const { messages, sendMessage } = useChat(
    createChatClientOptions({
      connection: fetchServerSentEvents("/api/chat"),
      tools: clientTools(showNotification),
    })
  );

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.parts.map((part) =>
            part.type === "text" ? <p>{part.content}</p> : null
          )}
        </div>
      ))}
    </div>
  );
}
```

### Pattern 3: Tool with Approval Flow

Set `needsApproval: true` in the definition. Execution pauses until the client
calls `addToolApprovalResponse()`. The part has `state: "approval-requested"`
and an `approval` object with an `id`.

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const sendEmailDef = toolDefinition({
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean(), messageId: z.string() }),
  needsApproval: true,
})

export const sendEmail = sendEmailDef.server(async ({ to, subject, body }) => {
  const result = await emailService.send({ to, subject, body })
  return { success: true, messageId: result.id }
})
```

Client -- render approval UI and respond:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function ChatPage() {
  const { messages, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.parts.map((part) => {
            if (part.type === "text") return <p>{part.content}</p>;
            if (
              part.type === "tool-call" &&
              part.state === "approval-requested" &&
              part.approval
            ) {
              return (
                <div key={part.id}>
                  <p>Approve "{part.name}"?</p>
                  <pre>{part.arguments}</pre>
                  <button
                    onClick={() =>
                      addToolApprovalResponse({
                        id: part.approval!.id,
                        approved: true,
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      addToolApprovalResponse({
                        id: part.approval!.id,
                        approved: false,
                      })
                    }
                  >
                    Deny
                  </button>
                </div>
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

### Pattern 4: Lazy Tool Discovery

Set `lazy: true` on rarely-needed tools. The LLM sees their names via a synthetic
`__lazy__tool__discovery__` tool and discovers schemas on demand. Saves tokens.

```typescript
import {
  toolDefinition,
  chat,
  toServerSentEventsResponse,
  maxIterations,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getProductsDef = toolDefinition({
  name: 'getProducts',
  description: 'List all products',
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({ id: z.number(), name: z.string(), price: z.number() }),
  ),
})
const getProducts = getProductsDef.server(async () => db.products.findMany())

const compareProductsDef = toolDefinition({
  name: 'compareProducts',
  description: 'Compare two or more products side by side',
  inputSchema: z.object({ productIds: z.array(z.number()).min(2) }),
  lazy: true, // not sent to LLM upfront
})
const compareProducts = compareProductsDef.server(async ({ productIds }) => {
  return db.products.findMany({ where: { id: { in: productIds } } })
})

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    tools: [getProducts, compareProducts],
    agentLoopStrategy: maxIterations(20),
  })
  return toServerSentEventsResponse(stream)
}
```

The LLM sees `getProducts` and `__lazy__tool__discovery__` upfront.
To compare, it first calls `__lazy__tool__discovery__({ toolNames: ["compareProducts"] })`,
gets the full schema, then calls `compareProducts` directly.
Once discovered, a tool stays available for the conversation.
When all lazy tools are discovered, the discovery tool is removed automatically.

## MCP Tools

`@tanstack/ai-mcp` lets a server-side `chat()` call discover and invoke tools
hosted on any MCP server (Streamable HTTP, SSE, or stdio).

### Basic usage — auto-discovery

```typescript
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        // 1. Connect to the MCP server.
        const mcp = await createMCPClient({
          transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
        })

        // 2. Discover all tools from the server (returns ServerTool[]).
        const mcpTools = await mcp.tools()

        // 3. Spread them into chat() — they work exactly like hand-written tools.
        // Caller owns the lifecycle — chat() never closes the client. Tools run
        // while the response streams, so close in a middleware terminal hook
        // (a try/finally around the return would close before tools execute).
        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          tools: [...mcpTools],
          middleware: [
            {
              name: 'mcp-close',
              onFinish: () => mcp.close(),
              onAbort: () => mcp.close(),
              onError: () => mcp.close(),
            },
          ],
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

### Typed path — pass toolDefinition instances

Pass bare `toolDefinition()` instances (no `.server()`) to `client.tools([...])`.
The MCP client supplies a `callTool` proxy as the execute function, while
input/output validation and types come from the definitions' Zod schemas.

```typescript
import { toolDefinition } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number(), conditions: z.string() }),
})

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
})

// Returns ServerTool[] typed to the definitions' input/output schemas.
// Throws MCPToolNotFoundError if the server does not expose a tool with that name.
const tools = await mcp.tools([getWeather])

const stream = chat({ adapter: openaiText('gpt-5.5'), messages, tools })
```

### Multiple servers with `createMCPClients`

```typescript
import { createMCPClients } from '@tanstack/ai-mcp'

// Each key becomes the default prefix for that server's tools.
await using pool = await createMCPClients({
  github: { transport: { type: 'http', url: 'https://mcp.github.com/mcp' } },
  linear: { transport: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
})

// Tools auto-prefixed: 'github_search_repos', 'linear_create_issue', etc.
const tools = await pool.tools()

const stream = chat({ adapter: openaiText('gpt-5.5'), messages, tools })
```

Use `pool.clients.<name>` for typed per-server access (resources, prompts, typed
`tools([defs])` overload).

### `ToolExecutionContext.abortSignal` — cancelling long-running tools

Every server tool's execute function now receives `abortSignal` in its context.
When the chat run aborts (e.g. the client disconnects or calls the run's
`abortController`), the signal fires and any in-flight `callTool` call is
cancelled automatically.

You can also forward it from your own server tools:

```typescript
const longRunningTool = myToolDef.server(async (args, ctx) => {
  // Forward to fetch, a DB query, or an MCP callTool call.
  const response = await fetch('https://slow.api/data', {
    signal: ctx?.abortSignal,
  })
  return response.json()
})
```

MCP tools wire this automatically — `makeMcpExecute` passes `ctx?.abortSignal`
as the `signal` option to `client.callTool(...)`, so MCP server calls cancel
with the chat run without any extra code.

### stdio transport (Node-only)

```typescript
import { createMCPClient } from '@tanstack/ai-mcp'
import { stdioTransport } from '@tanstack/ai-mcp/stdio'

const mcp = await createMCPClient({
  transport: stdioTransport({ command: 'npx', args: ['-y', 'my-mcp-server'] }),
})
```

Import `stdioTransport` from the `/stdio` subpath only — it contains Node.js
`child_process` imports and must not be bundled for edge runtimes.

### `chat({ mcp })` — discovery + lifecycle in one prop

Instead of manually calling `client.tools()` and managing `close()`, pass an
`mcp` object and let `chat()` handle discovery and lifecycle.

```typescript
// Prop shape (ChatMCPOptions):
// mcp: {
//   clients: Array<MCPClient | MCPClients>,
//   connection?: 'close' | 'keep-alive',  // default: 'close'
//   lazyTools?: boolean,
//   onDiscoveryError?: (error: unknown, source) => void,
// }
```

- At run start, `chat()` calls `.tools()` on every entry in `clients` and merges
  the results — identical to spreading `await client.tools()` into `tools: [...]`.
- `lazyTools: true` is forwarded to `tools({ lazy: true })`.
- `onDiscoveryError`: throw to fail-fast; return to skip that source.
- `connection: 'close'` (default) closes each client when the run ends (after
  the agent loop completes and the stream is drained). With `'keep-alive'`,
  `chat()` never closes the clients — the caller owns their lifecycle (keep
  connections warm across requests).

**When to use `mcp` vs. the tools spread:**

| Approach                                                | Use when                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `chat({ mcp: { clients: [...] } })`                     | Convenience: discovery + lifecycle in one place; untyped tool args are acceptable |
| `tools: [...await client.tools([toolDefinition(...)])]` | Fully-typed tool args/results via Zod schemas                                     |

**Example:**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcpClient = await createMCPClient({
          transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
        })

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: {
            clients: [mcpClient],
            connection: 'keep-alive',
            onDiscoveryError: (err, source) => {
              console.warn('MCP discovery failed, skipping source:', err)
              // returning (not throwing) skips this source and continues
            },
          },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

## Provider Skills

> **Not to be confused with `@tanstack/ai-code-mode-skills`**, which are locally-generated TypeScript functions executed client-side. Provider Skills are hosted, provider-managed bundles that the model loads on demand and runs inside the provider's server-side sandbox.

Provider Skills are inert without an execution tool. The execution tool is what activates the sandbox; skills are additional capability bundles that run inside it:

- **Anthropic**: skills require the `code_execution` tool (`@tanstack/ai-anthropic/tools`).
- **OpenAI**: skills live inside the `shell` tool (`@tanstack/ai-openai/tools`) and are Responses API only.

### Anthropic: `codeExecutionTool` with skills

Import from `@tanstack/ai-anthropic/tools`:

```typescript
import { codeExecutionTool } from '@tanstack/ai-anthropic/tools'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    tools: [
      codeExecutionTool(
        { type: 'code_execution_20250825', name: 'code_execution' },
        {
          skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }],
        },
      ),
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

`AnthropicContainerSkill` shape: `{ type: 'anthropic' | 'custom'; skill_id: string; version?: string }`. Constraints: max 8 skills per request; `skill_id` must be 1–64 characters.

The adapter automatically:

- Lifts the skills into the request's top-level `container.skills` param (the shape Anthropic's API requires).
- Attaches the required beta headers (`code-execution-2025-08-25` plus `skills-2025-10-02` when skills are present). You do not set these manually.

**Deprecation:** Setting skills via `modelOptions.container.skills` is deprecated. Use `codeExecutionTool(config, { skills })` instead — the legacy path bypasses the beta-header wiring.

### OpenAI: `shellTool` with skills (Responses API only)

Import from `@tanstack/ai-openai/tools`:

```typescript
import { shellTool } from '@tanstack/ai-openai/tools'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
    tools: [
      shellTool({
        environment: {
          type: 'container_auto',
          skills: [
            { type: 'skill_reference', skill_id: 'skill_abc', version: '2' },
          ],
        },
      }),
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

`SkillReference` shape: `{ type: 'skill_reference'; skill_id: string; version?: string }`. `version` is a string — use a positive integer as a string (e.g. `'2'`) or `'latest'`. This is Responses API only; Chat Completions does not support the shell tool.

### Scope

Only hosted/managed-by-id skills (`type: 'anthropic'` / `type: 'custom'` for Anthropic; `type: 'skill_reference'` for OpenAI) are wired. Inline bundles, local-path, and upload-API skill creation are not handled by these factories.

## Common Mistakes

### a. HIGH: Not passing tool definitions to both server and client

Server tools need `chat({ tools })`. Client tools need their definition in
`chat({ tools })` AND their `.client()` in `useChat({ tools: clientTools(...) })`.

Wrong -- tool only on server, client cannot execute:

```typescript
chat({ adapter, messages, tools: [myToolDef] })
useChat({ connection: fetchServerSentEvents('/api/chat') }) // no tools
```

Wrong -- tool only on client, LLM does not know about it:

```typescript
chat({ adapter, messages }); // no tools
useChat({ ..., tools: clientTools(myToolDef.client(() => result)) });
```

Correct:

```typescript
chat({ adapter, messages, tools: [myToolDef] });
useChat({ ..., tools: clientTools(myToolDef.client((input) => ({ success: true }))) });
```

Source: docs/tools/tools.md

## Cross-References

- See also: ai-core/chat-experience/SKILL.md -- Tools are used within chat
- See also: `@tanstack/ai-code-mode` package skills -- Code Mode is an alternative to tools for complex multi-step operations
