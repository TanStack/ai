---
title: Sandboxed Chat Tools
id: tools-sandboxed-tools
order: 14
description: "Run a chat tool or a server endpoint body in an isolate, so untrusted or AI-authored code can only reach the host functions you inject, under limits you set."
keywords:
  - tanstack ai
  - sandbox
  - isolate
  - sandboxedChatTool
  - runSandboxed
  - chat tools
  - server function
  - code mode
---

Wrap a tool's body in an isolate with `sandboxedChatTool()`. The tool reaches the host only through facades you declare, under limits you set. Drop it into `chat({ tools })` like any other server tool.

Reach for this when the tool body is not code you fully trust: a model wrote it, a user uploaded it, or you want a hard blast-radius wall around a tool that touches money, data, or the network. In the QuickJS isolate, the snippet has no `fetch`, no `fs`, and no `process`. The only way out is a facade you pass in.

For a full walkthrough, follow the [Sandbox a Tool and an Endpoint](../tutorials/secure-sandbox-tools) tutorial.

For an MCP server tool, use [`sandboxedTool()`](../mcp/server-sandboxed-tools) instead. It adds a per-caller OAuth scope gate and a signed manifest on top of the same engine.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
vue: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
solid: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
svelte: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
vanilla: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs

<!-- ::end:tabs -->

The driver is swappable. `@tanstack/ai-isolate-quickjs` is a WASM VM that runs server-side, including edge runtimes. See [Isolate Drivers](../code-mode/code-mode-isolates) for the others.

The isolation comes from the driver, not from this package. A remote driver (Daytona, E2B) runs the snippet in a VM or container that can have network access, and it may not apply `memoryMb`. Use QuickJS when the snippet must have no egress except the facades.

## A sandboxed chat tool

`sandboxedChatTool()` returns a plain server tool. The `snippet` is the tool body: it reads its input from `input` and calls facades on `host`.

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'

const driver = createQuickJSIsolateDriver()

// The host-side data. The snippet never sees this, only the facade.
const INVENTORY: Record<string, { qty: number; warehouse: string }> = {
  'SKU-123': { qty: 42, warehouse: 'PDX' },
}

const checkInventory = sandboxedChatTool({
  name: 'checkInventory',
  description: 'Check whether a SKU is in stock.',
  inputSchema: z.object({ sku: z.string() }),
  snippet: `
    const row = await host.db.inventory({ sku: input.sku })
    if (!row) return { sku: input.sku, found: false }
    return { sku: input.sku, inStock: row.qty > 0, qty: row.qty }
  `,
  facades: {
    'db.inventory': {
      description: 'Look up one SKU',
      execute: async (args: unknown) => {
        if (typeof args !== 'object' || args === null || !('sku' in args)) {
          throw new Error('sku is required')
        }
        return INVENTORY[String(args.sku)] ?? null
      },
    },
  },
  driver,
  limits: {
    wallClockMs: 2000,
    memoryMb: 64,
    maxInjectedCalls: 5,
    resultBytes: 16 * 1024,
  },
})

export async function POST(request: Request) {
  const { messages, threadId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    tools: [checkInventory],
  })
  return toServerSentEventsResponse(stream)
}
```

The agent calls `checkInventory`. Its body runs in the isolate and can only call `host.db.inventory`. A body that tried to `fetch`, read a file, or loop forever would be stopped. A blocked run throws, so the agent loop sees a normal tool error.

The model sees only the kind of stop: `a sandbox limit was hit` or `the snippet failed`. The raw message can contain facade internals, such as a database host name. It is on `error.cause`, so log it on the host.

## The limits

Every run is held to four limits. A run that trips one is rejected:

- `wallClockMs`: wall-clock budget. Kills an infinite loop.
- `memoryMb`: isolate heap cap.
- `maxInjectedCalls`: how many facade calls one run may make. A snippet that catches the over-budget error and returns a value is still rejected.
- `resultBytes`: max serialized result size. The check runs after the snippet returns.

To keep a large result, list its string fields in `truncatable`, as dotted paths such as `['body']` or `['rows.0.note']`. When the result is too large, each listed field is replaced with `…`, in order, until the result fits. If it still does not fit, the run is rejected.

Facades are the only egress. Secrets and backend URLs live in the facade closure, in your process, and never enter the isolate. A facade also enforces its own authorization: the isolate guarantees the snippet can reach only that facade, and the facade guarantees the caller may use it this way.

## Scope facades to the user

A facade gets the `chat({ context })` value as `ctx.context`. Use it to find the current user. It stays in your process and never enters the isolate.

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import type { FacadeContext } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'

type AppContext = { userId: string }

const ORDERS = [
  { id: 'o1', userId: 'user_123', total: 40 },
  { id: 'o2', userId: 'user_456', total: 95 },
]

const listOrders = sandboxedChatTool({
  name: 'listOrders',
  description: 'List the current user\'s orders.',
  inputSchema: z.object({}),
  snippet: `return await host.orders.list({})`,
  facades: {
    'orders.list': {
      execute: async (_args: unknown, ctx: FacadeContext<AppContext>) =>
        ORDERS.filter((order) => order.userId === ctx.context.userId),
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

export async function POST(request: Request) {
  const { messages, threadId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    tools: [listOrders],
    // Build this from your server session.
    context: { userId: 'user_123' },
  })
  return toServerSentEventsResponse(stream)
}
```

Follow these rules:

- Take the user from `ctx.context`, never from the facade `args`. The snippet picks the args, so it can ask for any user.
- Build the context on the server. If a value comes from the client in `forwardedProps`, validate it first. See [Client-to-Server Handoff](../advanced/runtime-context#client-to-server-handoff).
- Never return a context value, such as a token or a database client, from a facade. A facade's return value goes into the isolate.

## A sandboxed endpoint body

For a server endpoint, call `runSandboxed()` directly. Validate input on the host, run the snippet with injected facades, then return a result. A snippet error or a tripped limit comes back as `ok: false`. Bad setup, such as a driver that cannot start, throws:

```ts
import { createServerFn } from '@tanstack/react-start'
import { runSandboxed } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'

const driver = createQuickJSIsolateDriver()

export const getReport = createServerFn({ method: 'POST' })
  .validator(z.object({ team: z.string() }))
  .handler(async ({ data }) => {
    const run = await runSandboxed({
      snippet: `
        const m = await host.db.metrics({ team: input.team })
        return { team: m.team, p95: m.p95 }
      `,
      input: data,
      facades: {
        'db.metrics': {
          execute: async () => ({ team: data.team, p95: 123 }),
        },
      },
      driver,
      limits: {
        wallClockMs: 3000,
        memoryMb: 128,
        maxInjectedCalls: 10,
        resultBytes: 256 * 1024,
      },
    })
    if (!run.ok) {
      // run.error can contain facade internals: log it, don't return it.
      console.error(run.error)
      throw new Error(`report blocked (${run.kind})`)
    }
    return { ok: run.ok, ms: run.ms }
  })
```

`run.value` holds the snippet's return value, typed `unknown` because the snippet is untrusted. Validate or narrow it with a schema before you forward it to the client.

Whole-body sandboxing fits a non-streaming data endpoint or server function. The isolate boundary is JSON, so a streaming chat route cannot marshal its stream out of the isolate. For a streaming route, sandbox the tools with `sandboxedChatTool()` and let the route code own the stream.

## Result shape

`runSandboxed()` returns:

- `ok`: `true` when the snippet returned a value that fits `resultBytes`, possibly after truncation.
- `value`: the snippet's return value, when `ok` is `true`.
- `kind`: when `ok` is `false`, `'limit'` for a tripped limit or `'error'` for a thrown error.
- `error`: the raw message, when `ok` is `false`. It can contain facade internals.
- `injectedCalls`: how many facade calls the run made.
- `ms`: wall-clock duration.

`sandboxedChatTool()` wraps that for you: a blocked run throws, and a successful run returns the snippet's value to the agent. Facades get the `chat({ context })` value as `ctx.context`. See [Scope facades to the user](#scope-facades-to-the-user).
