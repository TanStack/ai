---
id: TaggedCustomEvent
title: TaggedCustomEvent
---

# Type Alias: TaggedCustomEvent\<T\>

```ts
type TaggedCustomEvent<T> = 
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent;
```

Defined in: [packages/ai/src/types.ts:1932](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1932)

Discriminated union of the orchestrator-tagged `CUSTOM` events. Each variant
has a literal `name`, so a single narrow on `chunk.name` yields a typed
`value` with no helper or cast:

```ts
if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
  chunk.value.toolCallId // typed as string
}
```

The `StructuredOutputCompleteEvent` value is parameterized by `T`, which
the chat orchestrator narrows to the schema's inferred type after Standard
Schema validation. Adapters always emit it with `T = unknown`.

Caveat: tools can emit arbitrary user-defined custom events via the
`emitCustomEvent(name, value)` context API. Those flow through the stream
at runtime but are intentionally absent from this union — including a bare
`CustomEvent` (whose `value: any` would poison the union) would collapse
`chunk.value` back to `any` after the narrow. If you rely on
`emitCustomEvent`, branch on `CUSTOM` outside the literal-`name` narrows
or cast the chunk to `StreamChunk` to recover the wider shape.

## Type Parameters

### T

`T` = `unknown`
