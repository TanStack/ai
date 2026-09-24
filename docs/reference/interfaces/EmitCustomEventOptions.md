---
id: EmitCustomEventOptions
title: EmitCustomEventOptions
---

Defined in: [packages/ai/src/types.ts:636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L636)

Options for a single `emitCustomEvent` call, on both the tool-execution and
middleware contexts.

## Properties

### batch?

```ts
optional batch?: boolean;
```

Defined in: [packages/ai/src/types.ts:645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L645)

Keep this event in the durability batch with later chunks.
CUSTOM events flush as soon as they are emitted, so a progress
indicator can render at emit time. Pass `{ batch: true }` for a
high-volume stream that should share appends with later output.
`process.stdout`, `process.stderr`, `sandbox.file`, and
`sandbox.file.diff` already batch.
