---
id: StructuredOutputStream
title: StructuredOutputStream
---

# Type Alias: StructuredOutputStream\<T\>

```ts
type StructuredOutputStream<T> = AsyncIterable<
  | Exclude<StreamChunk, CustomEvent>
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
| ToolInputAvailableEvent>;
```

Defined in: [packages/typescript/ai/src/types.ts:1153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1153)

Public type for streams returned by `chat({ outputSchema, stream: true })`.

Yields all standard `StreamChunk` lifecycle events plus the three tagged
`CUSTOM` events the orchestrator can emit through this path:
- `structured-output.complete` — terminal event with typed `value.object: T`
- `approval-requested` — server tool needs approval (pauses the run)
- `tool-input-available` — client tool invocation (pauses the run)

Each variant has a literal `name`, so a single discriminated narrow gives
you a typed `value` with no helper or cast:

```ts
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
    chunk.value.object // typed as T
  } else if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
    chunk.value.toolCallId // typed as string
  }
}
```

Caveat: tools can emit arbitrary user-defined custom events via the
`emitCustomEvent(name, value)` context API. Those flow through this stream
at runtime but are intentionally absent from this type — including a bare
`CustomEvent` (whose `value: any` would poison the union) would collapse
`chunk.value` back to `any` after the narrow. If you rely on
`emitCustomEvent` plus `outputSchema + stream: true`, branch on `CUSTOM`
outside the literal-`name` narrows or cast explicitly.

## Type Parameters

### T

`T` = `unknown`
