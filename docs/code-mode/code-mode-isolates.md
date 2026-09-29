---
title: Code Mode Isolate Drivers
id: code-mode-isolates
order: 4
description: "Compare Code Mode sandbox drivers and choose the right runtime for your deployment: Node isolated-vm, QuickJS WASM, QuickJS Bun (bun:ffi), Cloudflare Workers, Daytona sandboxes, and E2B sandboxes."
keywords:
  - tanstack ai
  - code mode
  - isolate driver
  - isolated-vm
  - quickjs
  - quickjs-bun
  - bun
  - bun:ffi
  - cloudflare workers
  - daytona
  - e2b
  - sandbox
  - secure execution
---

Isolate drivers provide the secure sandbox runtimes that [Code Mode](./code-mode.md) uses to execute generated TypeScript. All drivers implement the same `IsolateDriver` interface, so you can swap them without changing any other code.

## Choosing a Driver


|                      | Node (`isolated-vm`)     | QuickJS (WASM)              | QuickJS Bun (`bun:ffi`)  | Cloudflare Workers             | Daytona                            | E2B |
| -------------------- | ------------------------ | --------------------------- | ------------------------ | ------------------------------ | ---------------------------------- | --- |
| **Best for**         | Server-side Node.js apps | Browsers, edge, portability | Bun servers              | Edge deployments on Cloudflare | Full remote Linux sandboxes        | Remote E2B sandboxes |
| **Performance**      | Fast (V8 JIT)            | Slower (interpreted)        | Fast (native QuickJS)    | Fast (V8 on Cloudflare edge)   | Fast (native runtime; remote call) | Fast (native Node, remote call) |
| **Native deps**      | Yes (C++ addon)          | None                        | None (TinyCC on the fly) | None                           | None                               | None |
| **Browser support**  | No                       | Yes                         | No (Bun only)            | N/A                            | Yes                                | No |
| **Memory limit**     | Configurable             | Configurable                | Configurable             | N/A                            | Configurable                       | Configurable |
| **Stack size limit** | N/A                      | Configurable                | Configurable             | N/A                            | N/A                                | N/A |
| **Setup**            | `pnpm add`               | `pnpm add`                  | `bun add`                | Deploy a Worker first          | Create or pass a Daytona sandbox   | Create or pass an E2B sandbox |


---

## Node.js Driver (`@tanstack/ai-isolate-node`)

Uses V8 isolates via the [`isolated-vm`](https://github.com/laverdet/isolated-vm) native addon. This is the fastest option for server-side Node.js applications because generated code runs in the same V8 engine as the host, under JIT compilation, with no serialization overhead beyond tool call boundaries.

### Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-node
vue: @tanstack/ai-isolate-node
solid: @tanstack/ai-isolate-node
svelte: @tanstack/ai-isolate-node
preact: @tanstack/ai-isolate-node
angular: @tanstack/ai-isolate-node
vanilla: @tanstack/ai-isolate-node
octane: @tanstack/ai-isolate-node

<!-- ::end:tabs -->

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


| Option        | Type     | Default | Description                                                                                            |
| ------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `memoryLimit` | `number` | `128`   | Maximum heap size for the V8 isolate, in megabytes. Execution is terminated if this limit is exceeded. |
| `timeout`     | `number` | `30000` | Maximum wall-clock time per execution, in milliseconds.                                                |


### How it works

Each `execute_typescript` call creates a fresh V8 isolate. Your tools are bridged into the isolate as async reference functions — when generated code calls `external_myTool(...)`, the call crosses the isolate boundary back into the host Node.js process, executes your tool implementation, and returns the result. Console output (`log`, `error`, `warn`, `info`) is captured and returned in the execution result. The isolate is destroyed after each call.

---

## QuickJS Driver (`@tanstack/ai-isolate-quickjs`)

Uses [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly via Emscripten. Because the sandbox is a WASM module, it has no native dependencies and runs anywhere JavaScript runs: Node.js, browsers, Deno, Bun, and Cloudflare Workers (without deploying a separate Worker).

### Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-quickjs
vue: @tanstack/ai-isolate-quickjs
solid: @tanstack/ai-isolate-quickjs
svelte: @tanstack/ai-isolate-quickjs
preact: @tanstack/ai-isolate-quickjs
angular: @tanstack/ai-isolate-quickjs
vanilla: @tanstack/ai-isolate-quickjs
octane: @tanstack/ai-isolate-quickjs

<!-- ::end:tabs -->

### Usage

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver({
  memoryLimit: 128,     // MB
  timeout: 30_000,      // ms
  maxStackSize: 524288, // bytes (512 KiB)
  wasmLocation: '/assets/quickjs/emscripten-module.wasm',
})
```

### Options


| Option         | Type     | Default  | Description                                                                                                                          |
| -------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `memoryLimit`  | `number` | `128`    | Maximum heap memory for the QuickJS VM, in megabytes.                                                                                |
| `timeout`      | `number` | `30000`  | Maximum wall-clock time per execution, in milliseconds.                                                                              |
| `maxStackSize` | `number` | `524288` | Maximum call stack size in bytes (default: 512 KiB). Increase for deeply recursive code; decrease to catch runaway recursion sooner. |
| `wasmLocation` | `string` | — | URL or path from which Emscripten loads the QuickJS WASM binary. When omitted, `quickjs-emscripten` resolves its bundled binary. |

### Serving the WASM binary

Set `wasmLocation` when the QuickJS WASM binary is hosted in a public directory or on a CDN:

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver({
  wasmLocation: 'https://cdn.example.com/quickjs/emscripten-module.wasm',
})
```

Serve the synchronous release binary exported by `@jitl/quickjs-wasmfile-release-sync/wasm`. For a cross-origin URL, configure the host to allow cross-origin requests.


### How it works

QuickJS runs the synchronous WASM build and bridges host async functions (your tools) through QuickJS promises, avoiding suspension of the WASM stack. Fatal errors (memory exhaustion, stack overflow) are detected, the VM is disposed, and a structured error is returned. Console output is captured and returned with the result.

> **Performance note:** QuickJS interprets JavaScript rather than JIT-compiling it, so compute-heavy scripts run slower than with the Node driver. For typical LLM-generated scripts that are mostly waiting on `external_*` tool calls, this difference is not significant.

---

## QuickJS Bun Driver (`@tanstack/ai-isolate-quickjs-bun`)

Runs [QuickJS](https://bellard.org/quickjs/) natively on the [Bun](https://bun.sh/) runtime through `bun:ffi`, via the [`quickjs-bun`](https://github.com/superpowerdotcom/quickjs-bun) package. There are no native dependencies and no build step — the vendored QuickJS C sources are compiled on the fly with Bun's embedded TinyCC, once per process. This makes it the fastest sandboxed option for Code Mode on Bun.

### Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-quickjs-bun
vue: @tanstack/ai-isolate-quickjs-bun
solid: @tanstack/ai-isolate-quickjs-bun
svelte: @tanstack/ai-isolate-quickjs-bun
preact: @tanstack/ai-isolate-quickjs-bun
angular: @tanstack/ai-isolate-quickjs-bun
vanilla: @tanstack/ai-isolate-quickjs-bun
octane: @tanstack/ai-isolate-quickjs-bun

<!-- ::end:tabs -->

Requires Bun 1.3.14 or later. On Windows, provide a prebuilt QuickJS dynamic library via the `QUICKJS_BUN_NATIVE_LIBRARY` environment variable.

### Usage

```typescript
import { createQuickJSBunIsolateDriver } from '@tanstack/ai-isolate-quickjs-bun'

const driver = createQuickJSBunIsolateDriver({
  memoryLimit: 128,     // MB
  timeout: 30_000,      // ms
  maxStackSize: 524288, // bytes (512 KiB)
})
```

### Options


| Option         | Type     | Default  | Description                                                                                                                          |
| -------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `memoryLimit`  | `number` | `128`    | Maximum heap memory for the QuickJS runtime, in megabytes.                                                                           |
| `timeout`      | `number` | `30000`  | Maximum wall-clock time per execution, in milliseconds.                                                                              |
| `maxStackSize` | `number` | `524288` | Maximum call stack size in bytes (default: 512 KiB). Increase for deeply recursive code; decrease to catch runaway recursion sooner. |
| `maxToolCalls` | `number` | `1000`   | Maximum host tool calls per execution. Bounds output and memory growth from untrusted sandbox code that fans out (e.g. `Promise.all` over a huge array); exceeding it throws a catchable error inside the sandbox. |


### How it works

Each context gets a dedicated native QuickJS runtime with its own memory limit, stack size, and interrupt-based timeout, so contexts execute independently — unlike the WASM driver, which serializes all executions through one shared asyncified WASM module. Fatal errors (memory exhaustion, stack overflow) are detected, the VM is disposed, and a structured error is returned; create a fresh context afterwards. A per-execution `maxToolCalls` budget bounds host tool-call fan-out. Console output is captured and returned with the result.

> **Bun only:** This driver requires Bun 1.3.14 or later and throws a descriptive error when creating a context on Node.js — use the Node or QuickJS WASM driver there. On Bun, prefer this driver over the WASM one: it runs QuickJS natively, and quickjs-emscripten's asyncify bridge is unreliable for async host tool calls under Bun.

---

## Cloudflare Workers Driver (`@tanstack/ai-isolate-cloudflare`)

Runs generated code inside a [Cloudflare Worker](https://workers.cloudflare.com/) at the edge. Your application server sends code and tool schemas to the Worker via HTTP; the Worker executes the code and calls back when it needs a tool result. This keeps your tool implementations on your server while sandboxed execution happens on Cloudflare's global network.

### Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-cloudflare
vue: @tanstack/ai-isolate-cloudflare
solid: @tanstack/ai-isolate-cloudflare
svelte: @tanstack/ai-isolate-cloudflare
preact: @tanstack/ai-isolate-cloudflare
angular: @tanstack/ai-isolate-cloudflare
vanilla: @tanstack/ai-isolate-cloudflare
octane: @tanstack/ai-isolate-cloudflare

<!-- ::end:tabs -->

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


| Option          | Type     | Default | Description                                                                                                                 |
| --------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `workerUrl`     | `string` | —       | **Required.** Full URL of the deployed Cloudflare Worker.                                                                   |
| `authorization` | `string` | —       | Optional value sent as the `Authorization` header on every request. Use this to prevent unauthorized access to your Worker. |
| `timeout`       | `number` | `30000` | Maximum wall-clock time for the entire execution (including all tool round-trips), in milliseconds.                         |
| `maxToolRounds` | `number` | `10`    | Maximum number of tool-call/result cycles per execution. Prevents infinite loops when generated code calls tools in a loop. |


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

## Daytona Driver (`@tanstack/ai-isolate-daytona`)

Runs generated code inside a Daytona sandbox through `sandbox.process.codeRun`. Your application process still owns TanStack tool implementations; the Daytona sandbox only receives wrapped generated code plus replayed tool results.

### Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-daytona
vue: @tanstack/ai-isolate-daytona
solid: @tanstack/ai-isolate-daytona
svelte: @tanstack/ai-isolate-daytona
preact: @tanstack/ai-isolate-daytona
angular: @tanstack/ai-isolate-daytona
vanilla: @tanstack/ai-isolate-daytona
octane: @tanstack/ai-isolate-daytona

<!-- ::end:tabs -->

If your application creates sandboxes with the official Daytona SDK, also install it:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @daytona/sdk
vue: @daytona/sdk
solid: @daytona/sdk
svelte: @daytona/sdk
preact: @daytona/sdk
angular: @daytona/sdk
vanilla: @daytona/sdk
octane: @daytona/sdk

<!-- ::end:tabs -->

### Usage

```typescript
import { Daytona } from '@daytona/sdk'
import { createDaytonaIsolateDriver } from '@tanstack/ai-isolate-daytona'

const daytona = new Daytona()
const sandbox = await daytona.create({ language: 'typescript' })

const driver = createDaytonaIsolateDriver({
  sandbox,
  timeout: 30_000,
  maxToolRounds: 10,
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sandbox` | `DaytonaSandboxLike` | — | **Required.** A caller-owned Daytona sandbox-like object with `process.codeRun(code, params?, timeout?)`. |
| `timeout` | `number` | `30000` | Maximum wall-clock time for the entire execution, including replay rounds, in milliseconds. |
| `maxToolRounds` | `number` | `10` | Maximum number of sandbox <-> host tool callback rounds. Prevents infinite loops when generated code repeatedly asks for tools. |

### How it works

The driver uses the same host-owned tool replay shape as the Cloudflare driver without Cloudflare's parent Worker / Dynamic Worker split:

```text
Driver (your server)              Daytona sandbox
─────────────────────             ───────────────
Send: wrapped code        ──────▶  Execute with process.codeRun
                           ◀──────  Return: need_tools with tool requests
Execute tools locally
Replay with toolResults   ──────▶  Continue execution
                           ◀──────  Return: final result / more tool requests
...repeat until done...
```

Use this driver when you want Code Mode execution in a full Daytona sandbox instead of an in-process isolate, QuickJS WASM runtime, or Cloudflare Worker. The sandbox should use a language/runtime capable of executing the JavaScript emitted by Code Mode, and your application remains responsible for sandbox lifecycle, filesystem, network, cleanup, and secret policy. Creating a Code Mode context does not create or delete a Daytona sandbox.

## E2B Driver (`@tanstack/ai-isolate-e2b`)

Runs generated code as a `node` process in an E2B sandbox that your application creates. Tool implementations stay in your server process. When the code calls a tool, the call goes to your server, and the result goes back to the same process. The code runs once, from start to finish.

### Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-e2b e2b
vue: @tanstack/ai-isolate-e2b e2b
solid: @tanstack/ai-isolate-e2b e2b
svelte: @tanstack/ai-isolate-e2b e2b
preact: @tanstack/ai-isolate-e2b e2b
angular: @tanstack/ai-isolate-e2b e2b
vanilla: @tanstack/ai-isolate-e2b e2b
octane: @tanstack/ai-isolate-e2b e2b

<!-- ::end:tabs -->

### Usage

Set `E2B_API_KEY` in your server environment. Then create a sandbox and pass it to the driver:

```typescript
import { Sandbox } from 'e2b'
import { createE2BIsolateDriver } from '@tanstack/ai-isolate-e2b'

const sandbox = await Sandbox.create()

const driver = createE2BIsolateDriver({
  sandbox,
  timeout: 30_000,
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sandbox` | `E2BSandboxLike` | none | **Required.** The E2B sandbox that runs the code, for example from `Sandbox.create()`. A sandbox from `@e2b/code-interpreter` also works. |
| `timeout` | `number` | `30000` | Maximum time for one execution, tool calls included, in milliseconds. |

The `memoryLimit` of `createCodeMode` sets the heap limit of the `node` process.

### How it works

```text
Driver (your server)                 E2B sandbox
--------------------                 -----------
Start one node process    --------->  Run the generated code
                          <---------  Tool call request (stdout)
Run the tool locally
Send the result (stdin)   --------->  Continue from the same point
                          <---------  Final result
```

Side effects in the sandbox happen one time, also when the code calls many tools. A file write or an HTTP request is an example of such a side effect.

Your application owns these parts:

- **The sandbox lifecycle.** Creating a context does not create, pause, or kill the sandbox.
- **Who shares a sandbox.** Executions in one sandbox see the same files and network. Use one sandbox for each user or trusted scope.
- **Secrets.** The driver sends no API key or server environment into the sandbox.

The driver kills the process group on timeout, on `dispose()`, and after each execution. This includes processes that the code started. The sandbox template must have `node`, `setsid`, and `timeout`. The default E2B templates have them.

---

## The `IsolateDriver` Interface

All provided drivers satisfy this interface, exported from `@tanstack/ai-code-mode`:

```typescript
import type { ToolBinding, NormalizedError } from "@tanstack/ai-code-mode";

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
- [Code Mode with Snippets](./code-mode-with-snippets) — Add persistent, reusable snippet libraries

