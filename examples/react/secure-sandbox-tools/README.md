# secure-sandbox-tools

Run **untrusted endpoint and tool bodies in a QuickJS isolate** with
`@tanstack/ai-mcp-sandbox`, on two surfaces: a chat tool and a TanStack Start
server function. Walkthrough: [Secure Sandbox Tools tutorial](../../../docs/tutorials/secure-sandbox-tools.md).

The idea: the endpoint/tool _implementation_ is a snippet that can touch **only
the host functions ("facades") you inject**, under hard limits. No `fetch`, no
`fs`, no `process`, no surviving a timeout. So a tool "can't go off the rails"
no matter what code (AI-authored, user-uploaded, drifted) sits in the body.

## The shared engine

`runSandboxed()` and `sandboxedChatTool()` are first-class exports of
`@tanstack/ai-mcp-sandbox` (the unscoped siblings of its MCP `sandboxedTool()`).
`src/lib/sandbox.ts` is a thin wrapper that picks the QuickJS driver. Limits:
wall-clock ms, memory MB, max injected host-calls, max result bytes.

## Surface A — secure chat tool (`src/lib/secure-chat-tools.ts`)

`checkInventory` is a normal `chat()` tool whose body runs in the sandbox. It can
only call `host.db.inventory`; its blast radius is exactly that facade. Wired into
`/api/chat` via `tools: secureTools`. Ask the chat _"is SKU-123 in stock?"_
(needs `OPENAI_API_KEY` in `.env.local`).

## Surface B — sandboxed Start server function (`src/lib/sandbox-demo.ts`)

`runSandboxDemo` is a `createServerFn` whose body is sandboxed. The four buttons
on the index route each run a snippet with only `host.db.metrics`:

| Button                | What the snippet does   | Outcome                             |
| --------------------- | ----------------------- | ----------------------------------- |
| Run (allowed)         | reads `host.db.metrics` | returns metrics                     |
| Infinite loop         | `while (true) {}`       | blocked — wall-clock timeout (~2s)  |
| Reach 169.254.169.254 | `fetch(metadata-url)`   | blocked — no `fetch` in the isolate |
| Exceed call budget    | 100× `host.db.metrics`  | blocked — injected-call limit (5)   |

No API key needed for Surface B — it's pure isolate execution.

> **Streaming caveat.** Whole-body endpoint sandboxing fits _non-streaming_ data
> endpoints and server functions. A streaming chat route (SSE) can't marshal its
> stream out of the isolate, so there you sandbox the **tools** (Surface A), not
> the whole handler.

## Run

```bash
pnpm install
cp .env.example .env.local   # then set OPENAI_API_KEY (Surface A only)
pnpm --filter secure-sandbox-tools dev   # http://localhost:3100
```

QuickJS is a WASM VM that runs **server-side only** — the sandbox code is reached
only through the server function handler and the `/api/chat` route.
