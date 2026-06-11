---
'@tanstack/ai-isolate-quickjs-bun': minor
'@tanstack/ai-code-mode': patch
---

Add `@tanstack/ai-isolate-quickjs-bun`, a Code Mode isolate driver that runs QuickJS natively on the Bun runtime through `bun:ffi` (via [`quickjs-bun`](https://github.com/superpowerdotcom/quickjs-bun)).

It implements the same `IsolateDriver` contract as the existing drivers and is a drop-in replacement for `@tanstack/ai-isolate-quickjs` on Bun servers:

```typescript
import { createQuickJSBunIsolateDriver } from '@tanstack/ai-isolate-quickjs-bun'
import { createCodeModeTool } from '@tanstack/ai-code-mode'

const executeTypescript = createCodeModeTool({
  driver: createQuickJSBunIsolateDriver(),
  tools: [myTool],
})
```

Compared to the WASM driver:

- Native QuickJS through `bun:ffi` — no WebAssembly or asyncify overhead, and no native build step (the QuickJS sources are compiled once per process by Bun's embedded TinyCC).
- Each context gets a dedicated QuickJS runtime with its own memory and stack limits, so executions on different contexts are not serialized through a shared VM.
- Same normalized `MemoryLimitError` / `StackOverflowError` / `DisposedError` contract, console capture prefixes, and JSON tool-call protocol as the other drivers, plus a normalized `TimeoutError` for deadline expiry (the WASM driver surfaces timeouts as `InternalError: interrupted`).
- A configurable `maxToolCalls` limit (default 1000) bounds output and memory growth from untrusted sandbox code.

The driver requires Bun `>= 1.3.14` and throws an error when used on Node.js.

The `@tanstack/ai-code-mode` README and bundled skill are updated to document the new driver.
