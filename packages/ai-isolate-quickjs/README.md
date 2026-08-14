# @tanstack/ai-isolate-quickjs

QuickJS WASM driver for TanStack AI Code Mode. Runs everywhere — Node.js, browsers, and edge runtimes — with zero native dependencies.

## Installation

```bash
pnpm add @tanstack/ai-isolate-quickjs
```

## Usage

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { createCodeModeTool } from '@tanstack/ai-code-mode'

const driver = createQuickJSIsolateDriver({
  timeout: 30000, // execution timeout in ms (default: 30000)
  memoryLimit: 128, // memory limit in MB (default: 128)
  maxStackSize: 512 * 1024, // max stack size in bytes (default: 512 KiB)
  wasmLocation: '/assets/quickjs/emscripten-module.wasm', // optional public URL or path
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
- `wasmLocation` — Optional URL or path from which Emscripten loads the QuickJS WASM binary. When omitted, `quickjs-emscripten` resolves its bundled binary.

## Serving the WASM Binary

Use `wasmLocation` when your runtime requires the QuickJS WASM binary to be served from a public directory or CDN:

```typescript
const driver = createQuickJSIsolateDriver({
  wasmLocation: 'https://cdn.example.com/quickjs/emscripten-module.wasm',
})
```

The configured file must be the synchronous release binary exported by `@jitl/quickjs-wasmfile-release-sync/wasm`. Ensure cross-origin requests are allowed when serving it from another origin.

## Tradeoffs vs Node Driver

|                 | QuickJS (WASM)             | Node (`isolated-vm`)    |
| --------------- | -------------------------- | ----------------------- |
| Native deps     | None                       | Yes (C++ addon)         |
| Browser support | Yes                        | No                      |
| Performance     | Slower (interpreted)       | Faster (V8 JIT)         |
| Memory limit    | Configurable               | Configurable            |
| Best for        | Browser, edge, portability | Server-side performance |

## How It Works

Uses [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly via [`quickjs-emscripten`](https://github.com/nicolo-ribaudo/quickjs-emscripten). Each execution creates a fresh QuickJS context with tool bindings injected as global async functions.

## Runtime Limits and Errors

- QuickJS enforces runtime memory and stack limits for each context.
- Exceeding limits can produce normalized errors such as `MemoryLimitError` or `StackOverflowError`.
- Certain fatal limit conditions may dispose the underlying VM; create a fresh context before running more code after disposal.

## License

MIT
