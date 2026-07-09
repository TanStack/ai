---
id: StructuredOutputStream
title: StructuredOutputStream
---

# Type Alias: StructuredOutputStream\<T\>

```ts
type StructuredOutputStream<T> = AsyncIterable<
  | Exclude<StreamChunk, CustomEvent>
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
| ToolInputAvailableEvent>;
```

Defined in: [packages/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1531)

Public type for streams returned by `chat({ outputSchema, stream: true })`.

Yields all standard `StreamChunk` lifecycle events plus the typed
structured-output `CUSTOM` event emitted through this path:
- `structured-output.complete` — terminal event with typed `value.object: T`

User-actionable waits, such as tool approval and client tool input, are
represented by `RUN_FINISHED.outcome.type === 'interrupt'` in current core
streams. Legacy `approval-requested` and `tool-input-available` custom
events may still be consumed for replay and backward compatibility, but
they are not the current source of truth for waits.

Each variant has a literal `name`, so a single discriminated narrow gives
you a typed `value` with no helper or cast:

```ts
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
    chunk.value.object // typed as T
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
