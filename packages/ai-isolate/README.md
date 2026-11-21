<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-isolate

The engine-agnostic isolate contract for TanStack AI. This package owns the
`IsolateDriver` interface and its supporting types — the single seam that every
sandbox driver implements and that Code Mode (and other consumers) run against —
plus the small engine-agnostic helpers drivers share (`wrapCode`).

It ships **no engine**. Pick a driver package for a concrete engine:

- [`@tanstack/ai-isolate-quickjs`](https://www.npmjs.com/package/@tanstack/ai-isolate-quickjs) — QuickJS WASM, runs everywhere
- [`@tanstack/ai-isolate-node`](https://www.npmjs.com/package/@tanstack/ai-isolate-node) — Node `isolated-vm`
- [`@tanstack/ai-isolate-cloudflare`](https://www.npmjs.com/package/@tanstack/ai-isolate-cloudflare) — Cloudflare Workers
- [`@tanstack/ai-isolate-e2b`](https://www.npmjs.com/package/@tanstack/ai-isolate-e2b) — E2B
- [`@tanstack/ai-isolate-daytona`](https://www.npmjs.com/package/@tanstack/ai-isolate-daytona) — Daytona

## Installation

```bash
pnpm add @tanstack/ai-isolate
```

## The contract

```typescript group=readme
import type {
  IsolateDriver,
  IsolateConfig,
  IsolateContext,
  ExecutionResult,
  NormalizedError,
  ToolBinding,
} from '@tanstack/ai-isolate'
```

A driver implements one method:

```typescript group=readme
const driver: IsolateDriver = {
  async createContext(config) {
    // config.bindings — the injected capability surface (the security boundary)
    // config.timeout / config.memoryLimit — per-context limits
    return {
      async execute(code, options) {
        // run `code` against the injected bindings; honor options.signal
        return { success: true, value: undefined }
      },
      async dispose() {},
    }
  },
}
```

The injected `bindings` are the capability surface — a program receives exactly
the host functions you inject and nothing else. The sandbox engine is the second
wall.

## License

MIT
