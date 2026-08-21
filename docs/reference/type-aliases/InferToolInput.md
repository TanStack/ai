---
id: InferToolInput
title: InferToolInput
---

# Type Alias: InferToolInput\<T\>

```ts
type InferToolInput<T> = T extends object ? TInput extends JSONSchema ? unknown : InferSchemaType<TInput> : unknown;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:189](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L189)

Extract the input type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)

## Type Parameters

### T

`T`
