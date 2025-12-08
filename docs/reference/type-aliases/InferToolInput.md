---
id: InferToolInput
title: InferToolInput
---

# Type Alias: InferToolInput\<T\>

```ts
type InferToolInput<T> = T extends object ? TInput extends StandardSchemaV1 ? InferOutput<TInput> : any : any;
```

Defined in: [tools/tool-definition.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L66)

Extract the input type from a tool (inferred from Standard Schema)

## Type Parameters

### T

`T`
