---
id: InferToolOutput
title: InferToolOutput
---

# Type Alias: InferToolOutput\<T\>

```ts
type InferToolOutput<T> = T extends object ? TOutput extends StandardJSONSchemaV1<infer TInferred, unknown> ? TInferred : TOutput extends JSONSchema ? unknown : unknown : unknown;
```

Defined in: [activities/chat/tools/tool-definition.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L77)

Extract the output type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)

## Type Parameters

### T

`T`
