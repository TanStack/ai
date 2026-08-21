---
id: InferToolOutput
title: InferToolOutput
---

# Type Alias: InferToolOutput\<T\>

```ts
type InferToolOutput<T> = T extends object ? TOutput extends StandardJSONSchemaV1<any, any> ? InferSchemaType<TOutput> : TOutput extends StandardSchemaV1<any, any> ? InferSchemaType<TOutput> : TOutput extends JSONSchema ? unknown : InferSchemaType<TOutput> : unknown;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L198)

Extract the output type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)

## Type Parameters

### T

`T`
