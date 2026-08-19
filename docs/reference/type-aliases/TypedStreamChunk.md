---
id: TypedStreamChunk
title: TypedStreamChunk
---

# Type Alias: TypedStreamChunk\<TTools\>

```ts
type TypedStreamChunk<TTools> = HasTypedTools<TTools> extends true ? 
  | RemapStreamChunkForTools<StreamChunk, TTools>
  | KnownCustomEvent : 
  | Exclude<StreamChunk, CustomEvent>
  | KnownCustomEvent;
```

Defined in: [packages/ai/src/types.ts:1965](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1965)

## Type Parameters

### TTools

`TTools` *extends* `ReadonlyArray`\<[`AnyTool`](AnyTool.md)\> = `ReadonlyArray`\<[`AnyTool`](AnyTool.md)\>
