---
id: InferToolInput
title: InferToolInput
---

```ts
type InferToolInput<T> = T extends object ? TInput extends JSONSchema ? unknown : InferSchemaType<TInput> : unknown;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:193

Extract the input type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)

## Type Parameters

### T

`T`
