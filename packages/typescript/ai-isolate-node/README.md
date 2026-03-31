# @tanstack/ai-isolate-node

Node.js V8 isolate driver for TanStack AI Code Mode. Uses [`isolated-vm`](https://github.com/nicolo-ribaudo/isolated-vm) for fast, secure sandboxed execution.

## Requirements

- Node.js >= 18
- Native compilation toolchain (the `isolated-vm` package compiles a native addon)

## Installation

```bash
pnpm add @tanstack/ai-isolate-node
```

## Usage

```typescript
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { createCodeModeTool } from '@tanstack/ai-code-mode'

const driver = createNodeIsolateDriver({
  timeout: 30000, // execution timeout in ms (default: 30000)
  memoryLimit: 128, // memory limit in MB (default: 128)
})

const executeTypescript = createCodeModeTool({
  driver,
  tools: [myTool],
})
```

## Config Options

- `timeout` — Default execution timeout in milliseconds (default: 30000)
- `memoryLimit` — V8 isolate memory limit in MB (default: 128)

`createContext()` can override these defaults per execution context via `IsolateConfig` (`timeout`, `memoryLimit`).

## How It Works

Each `execute_typescript` call creates a fresh V8 isolate via `isolated-vm`. Tool bindings are injected as global async functions. Console output is captured into execution logs, and the isolate is disposed after execution completes for full cleanup.

## License

MIT
