---
id: StructuredOutputPart
title: StructuredOutputPart
---

```ts
type StructuredOutputPart<TData> = 
  | StructuredOutputPartBase<TData> & object
  | StructuredOutputPartBase<TData> & object;
```

Defined in: [packages/ai/src/types.ts:534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L534)

StructuredOutputPart — a typed structured response attached to the assistant
message that produced it. Generic over the schema-inferred data type so
consumers can thread `useChat({ outputSchema })`'s schema all the way down
to `messages[i].parts[j].data`. Defaults to `unknown` so untyped consumers
(e.g. internal codepaths that don't know about TSchema) keep working.

Discriminated on `status`: checking `status === 'complete'` narrows `data`
to `TData`.

## Type Parameters

### TData

`TData` = `unknown`
