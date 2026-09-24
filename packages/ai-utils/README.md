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

# @tanstack/ai-utils

Shared TypeScript utilities for TanStack AI provider adapters and runtime packages.

This is an internal dependency of the provider adapters (`@tanstack/ai-openai`, `@tanstack/ai-anthropic`, `@tanstack/ai-gemini`, …) and runtime packages. It has no dependencies of its own and no framework or provider code; you normally get it transitively rather than installing it yourself. It is documented here so adapter authors know what already exists before writing their own.

## Installation

```bash
npm install @tanstack/ai-utils
# or
pnpm add @tanstack/ai-utils
# or
yarn add @tanstack/ai-utils
```

## What's in it

| Export                                                             | Purpose                                                                                                                                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateId(prefix)`                                               | Prefixed unique id: `${prefix}-${timestamp}-${random}`, with the full base36 random portion kept for entropy.                                                           |
| `getApiKeyFromEnv(name)`                                           | Reads `name` from `window.env` (browser) or `process.env` (Node) and throws a clear error naming the variable when it is missing.                                       |
| `arrayBufferToBase64`, `base64ToArrayBuffer`, `base64ToUint8Array` | Cross-runtime base64 helpers. Prefer the native `Uint8Array.toBase64()` / `fromBase64()` when available, then Node's `Buffer`, then `atob` / `btoa`.                    |
| `transformNullsToUndefined(value)`                                 | Recursively strips every `null` from JSON-shaped structured output so `.optional()` fields round-trip through Zod. Schema-blind.                                        |
| `undoNullWidening(value, map?)`                                    | Strips only the `null`s that strict-mode schema widening synthesized, using the `NullWideningMap` recorded by the widening pass. `.nullable()` fields keep their nulls. |

### Ids and API keys

```typescript
import { generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'

const runId = generateId('run') // run-1758424800000-k3j9x2p1q
const apiKey = getApiKeyFromEnv('OPENAI_API_KEY') // throws if unset
```

### Base64

```typescript
import { arrayBufferToBase64, base64ToUint8Array } from '@tanstack/ai-utils'

const encoded = arrayBufferToBase64(await file.arrayBuffer())
const bytes = base64ToUint8Array(encoded)
```

Be cautious with large buffers on serverless and Workers runtimes: base64 multiplies the memory footprint by about 1.33× and can OOM the isolate.

### Nulls in structured output

OpenAI-style strict schemas require optional fields to be widened to `required` + nullable, so the provider returns `null` for an absent optional. Validating that `null` against the original schema fails, because `.optional()` means `T | undefined`, not `T | null`.

- `undoNullWidening(value, map)` is the precise fix: it consults the `NullWideningMap` built by `convertSchemaForStructuredOutput` in `@tanstack/ai` and drops only the nulls the widening pass introduced, so both `optional` and `nullable` fields round-trip. With no map, the value is returned untouched.
- `transformNullsToUndefined(value)` is the schema-blind fallback: it strips every `null`, including ones a `.nullable()` field legitimately allows, and is meant for `JSON.parse` output only (class instances, `Date`, `Map`, `Set` are not preserved).

## License

MIT
