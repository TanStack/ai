---
title: Code Mode Isolate Drivers
id: code-mode-isolates
order: 4
description: "Pick the sandbox that runs Code Mode for your server: Node isolated-vm, QuickJS WASM, QuickJS on Bun, Cloudflare Workers, Daytona, or E2B."
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

[Code Mode](./code-mode.md) runs the code that the model writes in a sandbox. Which sandbox you can use depends on where your server runs.

An isolate driver is that sandbox. All drivers have the same `IsolateDriver` shape, so you change the driver in one line and keep the rest of your code.

## Pick a driver

| Your server runs on | Driver | Package |
| ------------------- | ------ | ------- |
| Node.js | `createNodeIsolateDriver()` | `@tanstack/ai-isolate-node` |
| Bun | `createQuickJSBunIsolateDriver()` | `@tanstack/ai-isolate-quickjs-bun` |
| A browser, the edge, or anywhere without native addons | `createQuickJSIsolateDriver()` | `@tanstack/ai-isolate-quickjs` |
| Any server, with code that runs on Cloudflare | `createCloudflareIsolateDriver()` | `@tanstack/ai-isolate-cloudflare` |
| Any server, with code that runs in a full Linux sandbox | `createDaytonaIsolateDriver()` or `createE2BIsolateDriver()` | `@tanstack/ai-isolate-daytona` or `@tanstack/ai-isolate-e2b` |

Then give the driver to `createCodeMode`. This example uses QuickJS:

```typescript ignore
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createQuickJSIsolateDriver } from "@tanstack/ai-isolate-quickjs";

const { tools, systemPrompt } = createCodeMode({
  driver: createQuickJSIsolateDriver(),
  tools: [fetchWeather],
});
```

Nothing else in your route changes.

## Compare the drivers

|                      | Node (`isolated-vm`)     | QuickJS (WASM)              | QuickJS Bun (`bun:ffi`)  | Cloudflare Workers             | Daytona                            | E2B |
| -------------------- | ------------------------ | --------------------------- | ------------------------ | ------------------------------ | ---------------------------------- | --- |
| **Best for**         | Node.js servers          | Browsers, edge, portability | Bun servers              | Edge deployments on Cloudflare | Full remote Linux sandboxes        | Remote E2B sandboxes |
| **Speed**            | Fast (V8 JIT)            | Slower (interpreted)        | Fast (native QuickJS)    | Fast (V8 on Cloudflare edge)   | Fast (native runtime, remote call) | Fast (native Node, remote call) |
| **Native deps**      | Yes (C++ addon)          | None                        | None (TinyCC at runtime) | None                           | None                               | None |
| **Runs in a browser** | No                      | Yes                         | No (Bun only)            | N/A                            | No                                 | No |
| **Memory limit**     | Yes                      | Yes                         | Yes                      | N/A                            | No                                 | Yes |
| **Stack size limit** | N/A                      | Yes                         | Yes                      | N/A                            | N/A                                | N/A |
| **Setup**            | `pnpm add`               | `pnpm add`                  | `bun add`                | Deploy a Worker first          | Create or pass a Daytona sandbox   | Create or pass an E2B sandbox |

## Node.js driver

`@tanstack/ai-isolate-node` runs the code in a V8 isolate with the [`isolated-vm`](https://github.com/laverdet/isolated-vm) native addon. It is the fastest choice on a Node.js server.

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

The package needs Node.js 22 or later. `isolated-vm` is a native C++ addon. It must be compiled for your platform.

```typescript
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'

const driver = createNodeIsolateDriver({
  memoryLimit: 128, // MB
  timeout: 30_000, // ms
})
```

| Option        | Type      | Default | Description |
| ------------- | --------- | ------- | ----------- |
| `memoryLimit` | `number`  | `128`   | Largest heap for the V8 isolate, in MB. The execution stops if it goes over. |
| `timeout`     | `number`  | `30000` | Longest wall-clock time for one execution, in ms. |
| `skipProbe`   | `boolean` | `false` | Skips the compatibility probe for `isolated-vm`. If you made sure that the addon works on your Node.js version, you can set it. |

## QuickJS driver

`@tanstack/ai-isolate-quickjs` runs [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly. It has no native dependencies, so it runs anywhere JavaScript runs: Node.js, browsers, Deno, Bun, and Cloudflare Workers (with no separate Worker).

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

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver({
  memoryLimit: 128, // MB
  timeout: 30_000, // ms
  maxStackSize: 524288, // bytes (512 KiB)
  wasmLocation: '/assets/quickjs/emscripten-module.wasm',
})
```

| Option         | Type     | Default  | Description |
| -------------- | -------- | -------- | ----------- |
| `memoryLimit`  | `number` | `128`    | Largest heap for the QuickJS VM, in MB. |
| `timeout`      | `number` | `30000`  | Longest wall-clock time for one execution, in ms. |
| `maxStackSize` | `number` | `524288` | Largest call stack, in bytes (512 KiB). Increase it for deep recursion. Decrease it to stop runaway recursion sooner. |
| `wasmLocation` | `string` | none     | URL or path to load the QuickJS WASM binary from. If you leave it out, `quickjs-emscripten` uses its bundled binary. |

To host the WASM binary yourself, for example on a CDN, serve the synchronous release binary that `@jitl/quickjs-wasmfile-release-sync/wasm` exports. Then set `wasmLocation` to its URL. For a URL on another origin, configure the host to allow cross-origin requests.

QuickJS interprets JavaScript and does not JIT-compile it. Code with heavy computation runs slower than on the Node driver. Most generated scripts spend their time on `external_*` calls, so the difference is small.

## QuickJS Bun driver

`@tanstack/ai-isolate-quickjs-bun` runs QuickJS natively on [Bun](https://bun.sh/) through `bun:ffi`, with the [`quickjs-bun`](https://github.com/superpowerdotcom/quickjs-bun) package. Bun compiles the QuickJS C sources one time per process with its embedded TinyCC. You need no native dependencies and no build step. On Bun, it is the fastest sandbox for Code Mode.

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

The driver needs Bun 1.3.14 or later. On Node.js, it throws an error when it creates a context, so use the Node or QuickJS WASM driver there. On Windows, set the `QUICKJS_BUN_NATIVE_LIBRARY` environment variable to a prebuilt QuickJS dynamic library.

```typescript
import { createQuickJSBunIsolateDriver } from '@tanstack/ai-isolate-quickjs-bun'

const driver = createQuickJSBunIsolateDriver({
  memoryLimit: 128, // MB
  timeout: 30_000, // ms
  maxStackSize: 524288, // bytes (512 KiB)
})
```

| Option         | Type     | Default  | Description |
| -------------- | -------- | -------- | ----------- |
| `memoryLimit`  | `number` | `128`    | Largest heap for the QuickJS runtime, in MB. |
| `timeout`      | `number` | `30000`  | Longest wall-clock time for one execution, in ms. |
| `maxStackSize` | `number` | `524288` | Largest call stack, in bytes (512 KiB). Increase it for deep recursion. Decrease it to stop runaway recursion sooner. |
| `maxToolCalls` | `number` | `1000`   | Most host tool calls in one execution. It stops untrusted code that fans out, for example `Promise.all` over a huge array. If the code goes over, the sandbox throws an error that the code can catch. |

On Bun, use this driver and not the WASM one. The asyncify bridge of `quickjs-emscripten` is not reliable for async tool calls under Bun.

## Cloudflare Workers driver

`@tanstack/ai-isolate-cloudflare` runs the code in a [Cloudflare Worker](https://workers.cloudflare.com/). Your server sends the code to the Worker over HTTP. When the code calls a tool, the Worker asks your server, and your server runs the tool. Your tools stay on your server.

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

1. Add a `wrangler.toml` to your Worker project:

```toml
# wrangler.toml
name = "code-mode-worker"
main = "src/worker.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

[[worker_loaders]]
binding = "LOADER"
```

2. Add the Worker entry. The package exports a ready-made Worker:

```typescript
// src/worker.ts
export { default } from '@tanstack/ai-isolate-cloudflare/worker'
```

3. Run `wrangler dev` to test locally on `http://localhost:8787`, or run `wrangler deploy`.

4. Point the driver at the Worker URL:

```typescript
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'

const driver = createCloudflareIsolateDriver({
  workerUrl: 'https://my-code-mode-worker.my-account.workers.dev',
  authorization: process.env.CODE_MODE_WORKER_SECRET,
  timeout: 30_000,
  maxToolRounds: 10,
})
```

| Option          | Type     | Default | Description |
| --------------- | -------- | ------- | ----------- |
| `workerUrl`     | `string` | none    | Required. The full URL of the Worker. |
| `authorization` | `string` | none    | A value that the driver sends as the `Authorization` header on each request. |
| `timeout`       | `number` | `30000` | Longest wall-clock time for the full execution, tool round trips included, in ms. |
| `maxToolRounds` | `number` | `10`    | Most tool-call rounds in one execution. It stops code that calls tools in a loop. |

> [!WARNING]
> The Worker runs any code that it gets. Protect the Worker with authentication, rate limits, and an allowed-origin list before you deploy it. The ready-made Worker does not check the `Authorization` header, so check it in your own Worker or use Cloudflare Access.

The `worker_loader` binding works with `wrangler dev` on the Workers Free plan. To deploy, or to run `wrangler dev --remote`, you need the Workers Paid plan.

## Daytona driver

`@tanstack/ai-isolate-daytona` runs the code in a [Daytona](https://www.daytona.io/) sandbox with `sandbox.process.codeRun`. Your tools stay in your server process. The sandbox gets only the wrapped code and the tool results.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-isolate-daytona @daytona/sdk
vue: @tanstack/ai-isolate-daytona @daytona/sdk
solid: @tanstack/ai-isolate-daytona @daytona/sdk
svelte: @tanstack/ai-isolate-daytona @daytona/sdk
preact: @tanstack/ai-isolate-daytona @daytona/sdk
angular: @tanstack/ai-isolate-daytona @daytona/sdk
vanilla: @tanstack/ai-isolate-daytona @daytona/sdk
octane: @tanstack/ai-isolate-daytona @daytona/sdk

<!-- ::end:tabs -->

You need `@daytona/sdk` only if your app creates the sandboxes with the official Daytona SDK.

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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sandbox` | `DaytonaSandboxLike` | none | Required. A Daytona sandbox that you own, or any object with `process.codeRun(code, params?, timeout?)`. |
| `timeout` | `number` | `30000` | Longest wall-clock time for the full execution, replay rounds included, in ms. |
| `maxToolRounds` | `number` | `10` | Most tool callback rounds between the sandbox and your server. It stops code that asks for tools in a loop. |

The sandbox must use a runtime that can run the JavaScript that Code Mode makes. Your app owns the sandbox lifecycle, file system, network, cleanup, and secret policy. A Code Mode context does not create or delete a Daytona sandbox.

## E2B driver

`@tanstack/ai-isolate-e2b` runs the code as a `node` process in an [E2B](https://e2b.dev/) sandbox that your app creates. Your tools stay in your server process. The code runs one time, from start to finish.

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

Set `E2B_API_KEY` in your server environment. Then create a sandbox and give it to the driver:

```typescript
import { Sandbox } from 'e2b'
import { createE2BIsolateDriver } from '@tanstack/ai-isolate-e2b'

const sandbox = await Sandbox.create()

const driver = createE2BIsolateDriver({
  sandbox,
  timeout: 30_000,
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sandbox` | `E2BSandboxLike` | none | Required. The E2B sandbox that runs the code, for example from `Sandbox.create()`. A sandbox from `@e2b/code-interpreter` also works. |
| `timeout` | `number` | `30000` | Longest time for one execution, tool calls included, in ms. |

The `memoryLimit` of `createCodeMode` sets the heap limit of the `node` process.

Your app owns these parts:

- **The sandbox lifecycle.** A context does not create, pause, or kill the sandbox.
- **Who shares a sandbox.** All executions in one sandbox see the same files and network. Use one sandbox for each user or trusted scope.
- **Secrets.** The driver sends no API key or server environment into the sandbox.

## Advanced

### How the Node driver works

Each `execute_typescript` call creates a fresh V8 isolate. Your tools enter the isolate as async reference functions. When the code calls `external_myTool(...)`, the call crosses back into the host Node.js process, runs your tool, and returns the result. The driver captures the console output (`log`, `error`, `warn`, `info`) and returns it with the result. The isolate is destroyed after each call.

The first call to `createNodeIsolateDriver` runs a probe in a subprocess. The probe finds a native addon that does not match your Node.js version, which can otherwise crash the process with a segfault. If the probe fails, the driver throws an error that tells you to use the QuickJS driver or a supported Node.js version.

### How the QuickJS drivers work

The WASM driver runs the synchronous WASM build. It bridges your async tools through QuickJS promises, so the WASM stack does not suspend. All contexts share one WASM module.

The Bun driver gives each context its own native QuickJS runtime, with its own memory limit, stack size, and timeout. Contexts run independently.

On both drivers, a fatal error (out of memory, stack overflow) disposes of the VM and returns a structured error. With the Bun driver, create a fresh context after a fatal error.

### How the remote drivers call your tools

The Cloudflare and Daytona drivers use a request and response loop. Your server runs the tools:

```text
Driver (your server)              Worker or sandbox
--------------------              -----------------
Send: code + tool schemas  ---->  Run the code
                           <----  Return: needs tool X with args Y
Run tool X locally
Send: tool result          ---->  Continue
                           <----  Return: final result, or needs tool Z
...repeat until done...
```

Each round trip adds network latency. `maxToolRounds` stops runaway scripts and caps the number of hops. The driver collects the console output from all rounds and returns it in the final result.

The Daytona driver uses this loop with no parent Worker. It replays the code with the tool results that it has so far.

The E2B driver keeps one `node` process alive for the full execution:

```text
Driver (your server)                 E2B sandbox
--------------------                 -----------
Start one node process    --------->  Run the generated code
                          <---------  Tool call request (stdout)
Run the tool locally
Send the result (stdin)   --------->  Continue from the same point
                          <---------  Final result
```

Because the process does not replay, side effects in the sandbox happen one time, also when the code calls many tools. A file write and an HTTP request are examples of such side effects.

The E2B driver kills the process group on timeout, on `dispose()`, and after each execution. This includes processes that the code started, unless they moved to their own process group (`detached: true`). If the driver cannot confirm the kill after an execution, the result log records it, and the process can still run in the sandbox. `dispose()` does not throw. The sandbox template must have `node`, `setsid`, and `timeout`. The default E2B templates have them.

### The `IsolateDriver` interface

All drivers implement this interface from `@tanstack/ai-code-mode`. Implement it yourself to build a custom driver, for example on Docker or a Deno subprocess:

```typescript ignore
import type { NormalizedError, ToolBinding } from '@tanstack/ai-code-mode'

interface IsolateDriver {
  createContext(config: IsolateConfig): Promise<IsolateContext>
}

interface IsolateConfig {
  bindings: Record<string, ToolBinding>
  timeout?: number
  memoryLimit?: number
}

interface IsolateContext {
  execute<T = unknown>(code: string): Promise<ExecutionResult<T>>
  dispose(): Promise<void>
}

interface ExecutionResult<T = unknown> {
  success: boolean
  value?: T
  logs?: Array<string>
  error?: NormalizedError
}
```
