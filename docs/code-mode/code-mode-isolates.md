---
title: Code Mode Isolate Drivers
id: code-mode-isolates
order: 4
description: "Compare Code Mode sandbox drivers — Node isolated-vm, QuickJS WASM, and Cloudflare Workers — and choose the right runtime for your deployment."
keywords:
  - tanstack ai
  - code mode
  - isolate driver
  - isolated-vm
  - quickjs
  - cloudflare workers
  - sandbox
  - secure execution
---

Isolate drivers provide the secure sandbox runtimes that [Code Mode](./code-mode.md) uses to execute generated TypeScript. All drivers implement the same `IsolateDriver` interface, so you can swap them without changing any other code.

## Choosing a Driver

| | Node (`isolated-vm`) | QuickJS (WASM) | Cloudflare Workers |
|---|---|---|---|
| **Best for** | Server-side Node.js apps | Browsers, edge, portability | Edge deployments on Cloudflare |
| **Performance** | Fast (V8 JIT) | Slower (interpreted) | Fast (V8 on Cloudflare edge) |
| **Native deps** | Yes (C++ addon) | None | None |
| **Browser support** | No | Yes | N/A |
| **Memory limit** | Configurable | Configurable | N/A |
| **Stack size limit** | N/A | Configurable | N/A |
| **Setup** | `pnpm add` | `pnpm add` | Deploy a Worker first |

---

## Node.js Driver (`@tanstack/ai-isolate-node`)

Uses V8 isolates via the [`isolated-vm`](https://github.com/laverdet/isolated-vm) native addon. This is the fastest option for server-side Node.js applications because generated code runs in the same V8 engine as the host, under JIT compilation, with no serialization overhead beyond tool call boundaries.

### Installation

```bash
pnpm add @tanstack/ai-isolate-node
```

`isolated-vm` is a native C++ addon and must be compiled for your platform. It requires Node.js 18 or later.

### Usage

```typescript
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'

const driver = createNodeIsolateDriver({
  memoryLimit: 128,   // MB
  timeout: 30_000,    // ms
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `memoryLimit` | `number` | `128` | Maximum heap size for the V8 isolate, in megabytes. Execution is terminated if this limit is exceeded. |
| `timeout` | `number` | `30000` | Maximum wall-clock time per execution, in milliseconds. |

### How it works

Each `execute_typescript` call creates a fresh V8 isolate. Your tools are bridged into the isolate as async reference functions — when generated code calls `external_myTool(...)`, the call crosses the isolate boundary back into the host Node.js process, executes your tool implementation, and returns the result. Console output (`log`, `error`, `warn`, `info`) is captured and returned in the execution result. The isolate is destroyed after each call.

---

## QuickJS Driver (`@tanstack/ai-isolate-quickjs`)

Uses [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly via Emscripten. Because the sandbox is a WASM module, it has no native dependencies and runs anywhere JavaScript runs: Node.js, browsers, Deno, Bun, and Cloudflare Workers (without deploying a separate Worker).

### Installation

```bash
pnpm add @tanstack/ai-isolate-quickjs
```

### Usage

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver({
  memoryLimit: 128,     // MB
  timeout: 30_000,      // ms
  maxStackSize: 524288, // bytes (512 KiB)
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `memoryLimit` | `number` | `128` | Maximum heap memory for the QuickJS VM, in megabytes. |
| `timeout` | `number` | `30000` | Maximum wall-clock time per execution, in milliseconds. |
| `maxStackSize` | `number` | `524288` | Maximum call stack size in bytes (default: 512 KiB). Increase for deeply recursive code; decrease to catch runaway recursion sooner. |

### How it works

QuickJS WASM uses an asyncified execution model — the WASM module can pause while awaiting host async functions (your tools). Executions are serialized through a global queue to prevent concurrent WASM calls, which the asyncify model does not support. Fatal errors (memory exhaustion, stack overflow) are detected, the VM is disposed, and a structured error is returned. Console output is captured and returned with the result.

> **Performance note:** QuickJS interprets JavaScript rather than JIT-compiling it, so compute-heavy scripts run slower than with the Node driver. For typical LLM-generated scripts that are mostly waiting on `external_*` tool calls, this difference is not significant.

---

## Cloudflare Workers Driver (`@tanstack/ai-isolate-cloudflare`)

Runs generated code inside a [Cloudflare Worker](https://workers.cloudflare.com/) at the edge. Your application server sends code and tool schemas to the Worker via HTTP; the Worker executes the code and calls back when it needs a tool result. This keeps your tool implementations on your server while sandboxed execution happens on Cloudflare's global network.

### Installation

```bash
pnpm add @tanstack/ai-isolate-cloudflare
```

### Usage

```typescript
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'

const driver = createCloudflareIsolateDriver({
  workerUrl: 'https://my-code-mode-worker.my-account.workers.dev',
  authorization: process.env.CODE_MODE_WORKER_SECRET,
  timeout: 30_000,
  maxToolRounds: 10,
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerUrl` | `string` | — | **Required.** Full URL of the deployed Cloudflare Worker. |
| `authorization` | `string` | — | Optional value sent as the `Authorization` header on every request. Use this to prevent unauthorized access to your Worker. |
| `timeout` | `number` | `30000` | Maximum wall-clock time for the entire execution (including all tool round-trips), in milliseconds. |
| `maxToolRounds` | `number` | `10` | Maximum number of tool-call/result cycles per execution. Prevents infinite loops when generated code calls tools in a loop. |

### Deploying the Worker

The package exports a ready-made Worker handler at `@tanstack/ai-isolate-cloudflare/worker`. Create a `wrangler.toml` and a worker entry file:

```toml
# wrangler.toml
name = "code-mode-worker"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[unsafe]
bindings = [{ name = "eval", type = "eval" }]
```

```typescript
// src/worker.ts
export { default } from '@tanstack/ai-isolate-cloudflare/worker'
```

Deploy:

```bash
wrangler deploy
```

### How it works

The driver implements a request/response loop for tool execution:

```
Driver (your server)              Worker (Cloudflare edge)
─────────────────────             ─────────────────────────
Send: code + tool schemas  ──────▶  Execute code
                           ◀──────  Return: needs tool X with args Y
Execute tool X locally
Send: tool result          ──────▶  Resume execution
                           ◀──────  Return: final result / needs tool Z
...repeat until done...
```

Each round-trip adds network latency, so the `maxToolRounds` limit both prevents runaway scripts and caps the maximum number of cross-continent hops. Console output from all rounds is aggregated and returned in the final result.

> **Security:** The Worker requires `UNSAFE_EVAL` (local dev) or the `eval` unsafe binding (production) to execute arbitrary code. Restrict access using the `authorization` option or Cloudflare Access policies.

---

## The `IsolateDriver` Interface

All three drivers satisfy this interface, exported from `@tanstack/ai-code-mode`:

```typescript
interface IsolateDriver {
  createContext(config: IsolateConfig): Promise<IsolateContext>
}

interface IsolateConfig {
  bindings: Record<string, ToolBinding>
  timeout?: number
  memoryLimit?: number
}

interface IsolateContext {
  execute(code: string): Promise<ExecutionResult>
  dispose(): Promise<void>
}

interface ExecutionResult<T = unknown> {
  success: boolean
  value?: T
  logs: Array<string>
  error?: NormalizedError
}
```

You can implement this interface to build a custom driver — for example, a Docker-based sandbox or a Deno subprocess.

## Next Steps

- [Code Mode](./code-mode) — Core setup, API reference, and getting started guide
- [Showing Code Mode in the UI](./client-integration) — Display execution progress in your React app
- [Code Mode with Skills](./code-mode-with-skills) — Add persistent, reusable skill libraries
