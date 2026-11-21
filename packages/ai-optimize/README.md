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

# @tanstack/ai-optimize

Deterministic, optimization-driven tool-result context projection as a `chat()`
middleware. Nothing is truncated unless it is **optimized** — by the tool author
at field level (`context` on the tool definition), or by the consumer via
`optimize()` for tools they don't control (MCP above all). Unoptimized tool
results arrive whole.

Projection applies only to the **message projection** sent to the model.
Execution, persisted session data, the event stream, and UI rendering always
keep full fidelity. The original is retrievable by the model through an
injected `retrieve_context` tool.

```bash
npm install @tanstack/ai-optimize
```

## Author-optimized tools

Declare field-level projection on the tool definition. A `createContextRuntime()`
supplies the middleware and the `retrieve_context` tool.

```ts
import { toolDefinition } from '@tanstack/ai'
import { truncateHeadTail, aboveTokens } from '@tanstack/ai-optimize'
import { z } from 'zod'

const readFile = toolDefinition({
  name: 'read_file',
  description: 'Read a file from disk',
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  context: {
    result: {
      fields: {
        content: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })),
      },
    },
  },
})
```

Wire the middleware and the `retrieve_context` tool, then pass them to `chat()`:

```ts ignore
import { chat } from '@tanstack/ai'
import { createContextRuntime } from '@tanstack/ai-optimize'

const runtime = createContextRuntime()
chat({
  adapter,
  messages,
  tools: [readFile.server(readImpl), runtime.retrieveTool],
  middleware: [runtime.middleware],
})
```

## Wrapping foreign tools (MCP)

`optimize()` attaches policy to **copies** of tools you don't author — it never
mutates the caller's objects — and returns the middleware plus the tool set
(with `retrieve_context` appended when any applicable rule is retrievable).

```ts
import {
  optimize,
  truncateHeadTail,
  dropWithRef,
  aboveTokens,
} from '@tanstack/ai-optimize'

declare const toolsFromMcp: Parameters<typeof optimize>[0]

const opt = optimize(toolsFromMcp, {
  defaults: {
    projection: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })),
    mode: 'leaves',
  },
  tools: {
    write_file: { args: { fields: { content: dropWithRef() } } },
    fetch_page: {
      result: { fields: { body: truncateHeadTail({ maxTokens: 1000 }) } },
    },
  },
  exclude: ['get_account_balance'],
  onEvent: (e) => console.log(e),
})
```

Pass `opt.tools` and `opt.middleware` to `chat()`:

```ts ignore
chat({ adapter, messages, tools: opt.tools, middleware: [opt.middleware] })
```

## Guarantees

- **Projection, not data.** Canonical messages are never mutated; projection
  sets `providerMessages` for the model call only.
- **Deterministic & cache-honest.** Projection is a pure function of the
  messages plus the resolved policies, so the cached prefix is stable across
  iterations. Projecting a projected set is a no-op.
- **Errors are sacred.** Failed tool results (`state === 'error'`) are exempt
  unless the optimization sets `includeErrors: true`.
- **Observable.** Every projection and every retrieval emits an
  `OptimizationEvent` (via `onEvent`) and a `tanstack.optimize` log record.

All token counts are estimates (`text ≈ chars/4`, `JSON ≈ chars/2`) and are
written with a leading `~`.
