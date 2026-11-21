# Sandboxing endpoint & tool implementations — design notes

## The problem (the value)

A server endpoint or an agent tool is a piece of code that runs with **your
server's full authority**: your database, your secrets, your network, your file
system. That's fine when you wrote the code and trust it. It stops being fine
the moment the body is:

- **AI-authored** — a model wrote or edited the tool/endpoint body (code mode,
  "write me a tool" flows).
- **User-supplied** — a plugin, a saved "custom tool", an uploaded snippet.
- **Trusted but blast-radius-sensitive** — you wrote it, but a bug (an infinite
  loop, an accidental `fetch` to the cloud metadata endpoint, a runaway query)
  shouldn't be able to take down the box or exfiltrate anything.

In all three cases you want the same guarantee: **this code can only do the
specific things I handed it, for a bounded amount of time, and nothing else.**
That's what sandboxing buys. The code "can't go off the rails" because the rails
are the only thing it's standing on.

## The mechanism

Run the body inside a **QuickJS isolate** (a WASM JavaScript VM, in-process,
server-side only). The isolate has standard JS built-ins but **no ambient
capabilities** — no `fetch`, no `fs`, no `process`, no `require`. The only way
out is through **facades**: host functions you explicitly inject, named
`host.<ns>.<fn>`. Everything is held to hard **limits**: wall-clock, memory,
number of host calls, result size.

This is the engine from `@tanstack/ai-mcp-sandbox` (PR #2171). That package wraps
it into a signed, OAuth-scoped **MCP** `ServerTool`. Here we reuse the same
primitives for two surfaces #2171 doesn't cover — a `chat()` tool and a TanStack
Start endpoint — by dropping the MCP scope/auth/manifest layer and keeping just
the isolate + facades + limits.

```
             ┌──────────────────────── your server (full authority) ────────────────────────┐
 request ──► │  validate input (Zod)                                                         │
             │        │                                                                       │
             │        ▼                                                                       │
             │   runSandboxed({ snippet, input, facades, limits })                            │
             │        │                                                                       │
             │        ▼                                                                       │
             │   ┌─── QuickJS isolate (no fetch / fs / process) ───┐   tick++ (budget)        │
             │   │  const input = {...}                            │ ───────────► host.db.*   │
             │   │  const host = { db: { metrics: <binding> } }    │ ◄───────────  (facade)   │
             │   │  <snippet body>  // top-level await / return    │                           │
             │   └──────────────┬──────────────────────────────────┘                           │
             │                  ▼  JSON value                                                  │
             │        shapeResult() → { ok, value | error, injectedCalls, ms }                 │
             └──────────────────────────────────────────────────────────────────────────────┘
```

## The engine — `@tanstack/ai-mcp-sandbox`

`runSandboxed()` is a first-class export of `@tanstack/ai-mcp-sandbox`. You pass
it a driver, so it stays framework- and runtime-agnostic:

```ts
import { runSandboxed } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const run = await runSandboxed({
  snippet,
  input,
  facades,
  driver: createQuickJSIsolateDriver(),
  limits,
})
// run: { ok, value? | error?, injectedCalls, ms }  — structured, never throws
```

Internally it composes the package's own lower-level pieces: `resolveAllowed()`
(verify facades), `makeCallCounter()` (host-call budget), `buildBindings()`
(wrap each facade, ticking the counter, passing a `FacadeContext` where
auth/secrets live), `buildPrelude()` (rebuild the `host.<ns>.<fn>` tree and bind
`input` via `JSON.parse`, so a `__proto__` key stays inert), the driver's
`createContext()`/`execute()`, then `shapeResult()` (truncate, else error over
the size cap).

`src/lib/sandbox.ts` in this example is now a thin wrapper: it picks the QuickJS
driver and narrows the JSON result so a server function can return it.

## Surface A — a secure `chat()` tool (`src/lib/secure-chat-tools.ts`)

The package ships a `sandboxedChatTool()` helper that turns a snippet into a
plain `ServerTool`:

```ts
import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const checkInventory = sandboxedChatTool({
  name: 'checkInventory',
  description: 'Check whether a SKU is in stock.',
  inputSchema: z.object({ sku: z.string() }),
  snippet: INVENTORY_SNIPPET, // can only call host.db.inventory
  facades: { 'db.inventory': { execute: async ({ sku }) => db.lookup(sku) } },
  driver: createQuickJSIsolateDriver(),
  limits: {
    wallClockMs: 2000,
    memoryMb: 64,
    maxInjectedCalls: 5,
    resultBytes: 16_384,
  },
})
```

Because the output is a plain `ServerTool`, it drops straight into
`chat({ tools: [checkInventory] })`. The agent can call the tool; the tool's body
cannot exceed its facade + limits no matter what code sits in it. A blocked run
throws, so the agent loop sees a normal tool error.

## Surface B — a sandboxed Start endpoint

Two entry points onto the **same** `runScenario()` (`src/lib/sandbox-scenarios.ts`):

- **Server function** (`src/lib/sandbox-demo.ts`) — `createServerFn().validator(…).handler(…)`,
  called from React as `runSandboxDemo({ data: { scenario } })`.
- **HTTP API route** (`src/routes/api.sandbox-demo.ts`) — a plain
  `POST /api/sandbox-demo` you can `curl` or hit from any client.

```bash
curl -X POST http://localhost:3100/api/sandbox-demo \
  -H 'content-type: application/json' -d '{"scenario":"ok"}'
# → {"ok":true,"value":{"team":"payments","p95":123,"errorRate":0.004},"injectedCalls":1,"ms":13}
```

The pattern: **validate input on the host, pass a plain JSON `input` into the
isolate, inject facades, get a JSON result out, build the Response on the host.**

### The guardrails, demonstrated

Four scenarios, verified live:

| Scenario | Snippet                             | Outcome                                         | Guardrail   |
| -------- | ----------------------------------- | ----------------------------------------------- | ----------- |
| `ok`     | reads `host.db.metrics`             | `ok:true`, metrics, ~13ms                       | —           |
| `loop`   | `while (true) {}`                   | `blocked` — "Code execution timed out", ~2004ms | wall-clock  |
| `fetch`  | `fetch('http://169.254.169.254/…')` | `blocked` — "'fetch' is not defined"            | no network  |
| `budget` | 100× `host.db.metrics`              | `blocked` — "Injected-call limit reached (5)"   | call budget |

## Why not sandbox the chat endpoint's whole body?

The QuickJS boundary is **JSON**: you marshal `input` in and a value out. A
streaming chat route (`chat()` → SSE) produces an async stream that can't be
marshaled out of the isolate. So:

- **Non-streaming data endpoints / server functions** → sandbox the whole body
  (Surface B).
- **Streaming chat routes** → sandbox the **tools** (Surface A), and let the
  trusted route code own the stream.

That split is the whole reason both surfaces exist.

## Threat model — what this does and doesn't cover

**Covers:** untrusted/buggy _JS logic_ escalating beyond its grant — no ambient
network/fs/process, hard timeout (kills infinite loops), heap cap, host-call
budget, result-size cap, and a facade allowlist that is the sole egress.

**Does not cover (the host's job):** what a facade _itself_ does. `host.db.metrics`
must enforce its own authorization and value-level policy (which team, which
rows). The isolate guarantees _only this facade is reachable_; the facade
guarantees _this caller may use it this way_. Secrets and backend URLs live in
the facade closure, never in the isolate.

## Status

`runSandboxed()` and `sandboxedChatTool()` are now first-class exports of
`@tanstack/ai-mcp-sandbox` (alongside the existing `sandboxedTool()` for MCP).
This example consumes them directly.

Not promoted into the package: the Start server-function wrapper. It is a
one-liner the app owns (`createServerFn().validator(…).handler(({ data }) =>
runSandboxed(…))`), and the package stays free of a `@tanstack/react-start`
dependency.

Still open for the "full feature" step: an E2E spec and a changeset (this rides
on the open `ai-mcp-sandbox` PR branch).
