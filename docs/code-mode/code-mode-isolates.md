---
title: Code Mode Isolate Drivers
id: code-mode-isolates
order: 4
description: "Pick a Code Mode sandbox: Node isolated-vm, QuickJS WASM, or Cloudflare Workers."
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

# Code Mode isolate drivers

If you need a sandbox for [Code Mode](./code-mode.md) → pick a driver. All implement `IsolateDriver` (swappable).

## Choose

| | Node (`isolated-vm`) | QuickJS (WASM) | Cloudflare Workers |
|---|---|---|---|
| **Best for** | Node servers | Browser / portable edge | Cloudflare edge |
| **Speed** | Fast (V8 JIT) | Slower (interpreted) | Fast (edge V8) |
| **Native deps** | Yes (C++) | None | None |
| **Browser** | No | Yes | N/A |
| **Setup** | `pnpm add` | `pnpm add` | Deploy Worker first |

## Node (`@tanstack/ai-isolate-node`)

```bash
pnpm add @tanstack/ai-isolate-node
```

Requires Node 18+ (native addon).

```typescript
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'

const driver = createNodeIsolateDriver({
  memoryLimit: 128, // MB
  timeout: 30_000, // ms
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `memoryLimit` | `number` | `128` | Heap MB |
| `timeout` | `number` | `30000` | Wall-clock ms |

Each `execute_typescript` gets a fresh V8 isolate. Tools bridge as async refs (`external_*`). Console captured. Isolate destroyed after the call.

## QuickJS (`@tanstack/ai-isolate-quickjs`)

```bash
pnpm add @tanstack/ai-isolate-quickjs
```

```typescript
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver({
  memoryLimit: 128,
  timeout: 30_000,
  maxStackSize: 524288, // 512 KiB
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `memoryLimit` | `number` | `128` | Heap MB |
| `timeout` | `number` | `30000` | Wall-clock ms |
| `maxStackSize` | `number` | `524288` | Stack bytes |

Asyncified WASM; executions serialized through a global queue. Fatals dispose the VM and return a structured error. Compute-heavy scripts slower than Node; tool-wait heavy scripts are fine.

## Cloudflare (`@tanstack/ai-isolate-cloudflare`)

Tools stay on your server; code runs on the edge Worker.

```bash
pnpm add @tanstack/ai-isolate-cloudflare
```

```typescript
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'

const driver = createCloudflareIsolateDriver({
  workerUrl: 'https://my-code-mode-worker.my-account.workers.dev',
  authorization: process.env.CODE_MODE_WORKER_SECRET,
  timeout: 30_000,
  maxToolRounds: 10,
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerUrl` | `string` | required | Worker URL |
| `authorization` | `string` | — | `Authorization` header |
| `timeout` | `number` | `30000` | Full run incl. tool RTs |
| `maxToolRounds` | `number` | `10` | Max tool cycles |

### Deploy Worker

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

```bash
wrangler deploy
```

Loop: send code + schemas → Worker needs tool → host runs tool → send result → repeat. Logs aggregated. Secure with `authorization` or Cloudflare Access. Needs `UNSAFE_EVAL` / `eval` binding.

## `IsolateDriver` interface

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

Implement for custom sandboxes (Docker, Deno, etc.).

## Next

- [Code Mode](./code-mode) · [Client UI](./client-integration) · [Skills](./code-mode-with-skills)
