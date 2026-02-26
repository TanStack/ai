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
  timeout: 30000,  // execution timeout in ms (default: 30000)
})

const executeTypescript = createCodeModeTool({
  driver,
  tools: [myTool],
})
```

## Config Options

- `timeout` — Default execution timeout in milliseconds (default: 30000)

## Tradeoffs vs Node Driver

| | QuickJS (WASM) | Node (`isolated-vm`) |
|---|---|---|
| Native deps | None | Yes (C++ addon) |
| Browser support | Yes | No |
| Performance | Slower (interpreted) | Faster (V8 JIT) |
| Memory limit | Not supported | Configurable |
| Best for | Browser, edge, portability | Server-side performance |

## How It Works

Uses [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly via [`quickjs-emscripten`](https://github.com/nicolo-ribaudo/quickjs-emscripten). Each execution creates a fresh async QuickJS context with tool bindings injected as global async functions.

## License

MIT
