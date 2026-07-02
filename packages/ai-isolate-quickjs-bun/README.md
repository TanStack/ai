# @tanstack/ai-isolate-quickjs-bun

Native QuickJS driver for TanStack AI Code Mode on the [Bun](https://bun.sh) runtime. Runs the same QuickJS engine as `@tanstack/ai-isolate-quickjs`, but natively through [`bun:ffi`](https://bun.sh/docs/api/ffi) instead of WebAssembly — substantially faster context creation and execution, with the same sandboxing guarantees.

## Requirements

- Bun `>= 1.3.14` — the driver throws a descriptive error when used on Node.js (use `@tanstack/ai-isolate-node` or `@tanstack/ai-isolate-quickjs` there).
- macOS or Linux on `x86_64`/`aarch64` work out of the box ([`quickjs-bun`](https://github.com/superpowerdotcom/quickjs-bun) compiles the vendored QuickJS sources on the fly with Bun's embedded TinyCC — no build tools needed). On Windows, point the `QUICKJS_BUN_NATIVE_LIBRARY` environment variable at a prebuilt QuickJS dynamic library.

## Installation

```bash
bun add @tanstack/ai-isolate-quickjs-bun
```

## Usage

```typescript
import { createQuickJSBunIsolateDriver } from '@tanstack/ai-isolate-quickjs-bun'
import { createCodeModeTool } from '@tanstack/ai-code-mode'

const driver = createQuickJSBunIsolateDriver({
  timeout: 30000, // execution timeout in ms (default: 30000)
  memoryLimit: 128, // memory limit in MB (default: 128)
  maxStackSize: 512 * 1024, // max stack size in bytes (default: 512 KiB)
  maxToolCalls: 1000, // max host tool calls per execution (default: 1000)
})

const executeTypescript = createCodeModeTool({
  driver,
  tools: [myTool],
})
```

## Config Options

- `timeout` — Default execution timeout in milliseconds (default: 30000)
- `memoryLimit` — Default QuickJS runtime memory limit in MB (default: 128)
- `maxStackSize` — Default QuickJS runtime max stack size in bytes (default: 524288)
- `maxToolCalls` — Maximum host tool calls per execution (default: 1000). Bounds output and memory growth from untrusted sandbox code; exceeding it throws a catchable error inside the sandbox.

Console output is captured and returned to the model; it is bounded to 10,000 entries / ~1 MB per execution, after which a `[log output truncated]` marker is appended and further output dropped.

## Tradeoffs vs QuickJS WASM Driver

|              | QuickJS Bun (`bun:ffi`)        | QuickJS (WASM)             |
| ------------ | ------------------------------ | -------------------------- |
| Runtime      | Bun only                       | Node, browser, edge        |
| Native deps  | None (TinyCC compiles QuickJS) | None                       |
| Performance  | Fast (native QuickJS)          | Slower (WASM + asyncify)   |
| Memory limit | Per-context runtime            | Configurable               |
| Concurrency  | Independent contexts           | Serialized (one WASM VM)   |
| Best for     | Bun servers                    | Browser, edge, portability |

Each context gets a dedicated native QuickJS runtime, so executions on different contexts run independently — the WASM driver has to serialize all executions through one asyncified WASM module.

## How It Works

Uses [QuickJS](https://bellard.org/quickjs/) bound natively through [`quickjs-bun`](https://github.com/superpowerdotcom/quickjs-bun) (`bun:ffi`). The QuickJS library is compiled once per process (~100ms); each execution then creates a fresh QuickJS runtime + context (~1-2ms) with its own memory and stack limits, and tools injected as global async functions that bridge back to the host. Async tool calls resolve through QuickJS promises driven by the host event loop.

## Runtime Limits and Errors

- Every context enforces its own memory and stack limits via QuickJS `JS_SetMemoryLimit` / `JS_SetMaxStackSize`; timeouts use `JS_SetInterruptHandler` and also bound async tool waits.
- Exceeding limits produces normalized errors such as `MemoryLimitError`, `StackOverflowError`, or `TimeoutError`.
- Fatal limit conditions dispose the underlying VM; create a fresh context before running more code after disposal.

## Benchmarks

`benchmarks/compare-with-wasm.ts` compares this driver against `@tanstack/ai-isolate-quickjs` (WASM) through the public `IsolateDriver` interface:

```bash
bun benchmarks/compare-with-wasm.ts
```

Representative numbers (Apple M-series, darwin/arm64; Bun 1.3.14 for this driver, Node 22 for the WASM driver):

| Scenario (fresh context per run) | QuickJS Bun | QuickJS WASM (Node) |
| -------------------------------- | ----------: | ------------------: |
| Cold start (first context + run) |     ~150 ms |              ~24 ms |
| `return 1 + 1`                   |     0.63 ms |    13.5 ms (median) |
| 3 sequential tool calls          |     0.77 ms |          see note ¹ |
| 8 sequential tool calls          |     0.85 ms |          see note ¹ |
| compute (recursive `fib(20)`)    |      4.5 ms |          see note ¹ |
| `return 1 + 1` (reused context)  |     0.04 ms |                   — |

¹ In our benchmark runs, the WASM driver's asyncified host tool calls repeatedly crashed the shared WASM module (`memory access out of bounds`) and hung subsequent executions, on both Node 22 and Bun 1.3.14 — e.g. deterministically after running executions with 1, 2, 3, then 4 sequential awaited tool calls in one process. Sync-only workloads were unaffected.

## License

MIT
