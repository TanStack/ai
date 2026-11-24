---
title: Sandbox a Tool and an Endpoint
id: secure-sandbox-tools
order: 14
description: "Run a chat tool body and a server function body in a QuickJS isolate, so untrusted code can only call the host functions you inject."
keywords:
  - tanstack ai
  - tutorial
  - sandbox
  - isolate
  - quickjs
  - sandboxedChatTool
  - runSandboxed
  - tanstack start
---

A tool body that a model wrote or a user uploaded can do anything your server can do. It can call `fetch`, read files, or loop forever.

This tutorial runs that code in a QuickJS isolate. The code can call only the host functions you give it, and each run has hard limits. You sandbox two things: a chat tool and a server function. It takes about 15 minutes.

For the short guide, open [Sandboxed Chat Tools](../tools/sandboxed-tools).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install these packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs zod

<!-- ::end:tabs -->

Put your OpenAI key in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

## 2. Know what runs where

- **The client** sends chat messages and shows the replies. It never sees the sandbox.
- **The server** owns the model call, the isolate, and the facades. A facade is a host function that the sandboxed code may call.
- **The isolate** runs the untrusted code. In QuickJS, that code has no `fetch`, no `fs`, and no `process`. Its only way out is a facade.

## 3. Sandbox a chat tool

Create `src/lib/secure-chat-tools.ts`. `sandboxedChatTool()` returns a normal server tool. The `snippet` is the tool body. It reads its arguments from `input` and calls facades on `host`.

```ts
import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'

// The host-side data. The snippet never sees this, only the facade.
const INVENTORY: Record<string, { qty: number; warehouse: string }> = {
  'SKU-123': { qty: 42, warehouse: 'PDX' },
  'SKU-777': { qty: 0, warehouse: 'LAX' },
}

const checkInventory = sandboxedChatTool({
  name: 'checkInventory',
  description:
    'Check whether a SKU is in stock and how many units are available. ' +
    'Known SKUs: SKU-123, SKU-777.',
  inputSchema: z.object({
    sku: z.string().describe('The SKU to look up, e.g. "SKU-123"'),
  }),
  // The tool body. It runs in the isolate and sees only `input` and `host`.
  snippet: `
    const row = await host.db.inventory({ sku: input.sku })
    if (!row) return { sku: input.sku, found: false }
    return { sku: input.sku, found: true, inStock: row.qty > 0, qty: row.qty }
  `,
  // The only thing the snippet can call. Secrets stay in this closure.
  facades: {
    'db.inventory': {
      description: 'Look up one SKU in the warehouse table',
      execute: async (args) => {
        if (typeof args !== 'object' || args === null || !('sku' in args)) {
          throw new Error('sku is required')
        }
        return INVENTORY[String(args.sku)] ?? null
      },
    },
  },
  driver: createQuickJSIsolateDriver(),
  limits: {
    wallClockMs: 2000,
    memoryMb: 64,
    maxInjectedCalls: 5,
    resultBytes: 16 * 1024,
  },
})

export const secureTools = [checkInventory]
```

Each limit stops one kind of runaway code:

- `wallClockMs` stops an infinite loop.
- `memoryMb` caps the isolate heap.
- `maxInjectedCalls` caps facade calls in one run.
- `resultBytes` caps the size of the result.

The facade checks its own input. The isolate makes sure the snippet can reach only this facade. The facade makes sure the call is allowed.

## 4. Add the chat route

Create `src/routes/api.chat.ts`, next to `index.tsx`. Start maps this file name to the `/api/chat` path. Pass the sandboxed tool to `chat()` like any other tool.

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { secureTools } from '@/lib/secure-chat-tools'

const SYSTEM_PROMPT =
  'You are an inventory assistant. Use the checkInventory tool to answer ' +
  'stock questions. Its body runs in a sandbox, so it can only read the ' +
  'inventory table.'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    systemPrompts: [SYSTEM_PROMPT],
    tools: secureTools,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

When the sandbox stops a run, the tool throws. The model sees only `a sandbox limit was hit` or `the snippet failed`. The raw message can contain facade internals, so it stays on `error.cause` on the server.

## 5. Call the chat from the page

In `src/routes/index.tsx`, connect `useChat` to the route. The client needs nothing special for the sandbox.

```tsx ignore
const { messages, sendMessage, isLoading, error, stop } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'secure-sandbox-tools',
})
```

Ask "Is SKU-123 in stock?". The model calls `checkInventory`, and the snippet answers from the facade.

## 6. Sandbox a server function body

A data endpoint that does not stream can run its whole body in the isolate. Call `runSandboxed()` from a server function. Create `src/lib/sandbox-demo.ts`:

```ts ignore
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { SCENARIO_IDS, runScenario } from './sandbox-scenarios'

export const runSandboxDemo = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      scenario: z.enum(SCENARIO_IDS),
      team: z.string().default('payments'),
    }),
  )
  .handler(async ({ data }) => runScenario(data.scenario, data.team))
```

`runScenario` in `src/lib/sandbox-scenarios.ts` passes one of four snippets to `runSandboxed()`, with only a `db.metrics` facade. One snippet does real work. The other three try to escape:

| Snippet                    | Result                                 |
| -------------------------- | -------------------------------------- |
| Reads `host.db.metrics`    | `ok: true` with the metrics            |
| `while (true) {}`          | `ok: false`, `kind: 'limit'` (timeout) |
| `fetch('http://169.254…')` | `ok: false`, `kind: 'error'` (no fetch) |
| 100 facade calls           | `ok: false`, `kind: 'limit'` (budget)  |

A blocked run comes back as `ok: false`. It does not throw, so the page shows it like any other result. Bad setup, such as a driver that cannot start, still throws.

A streaming chat route cannot run inside the isolate, because only JSON crosses the boundary. For a chat route, sandbox the tools, as in step 3.

<!-- ::client-example library=ai framework=react slug=secure-sandbox-tools -->

The full example is on GitHub: [TanStack/ai `examples/react/secure-sandbox-tools`](https://github.com/TanStack/ai/tree/main/examples/react/secure-sandbox-tools).
