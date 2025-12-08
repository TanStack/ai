---
id: InferToolOutput
title: InferToolOutput
---

# Type Alias: InferToolOutput\<T\>

```ts
type InferToolOutput<T> = T extends object ? TOutput extends StandardSchemaV1 ? InferOutput<TOutput> : any : any;
```

Defined in: [tools/tool-definition.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L75)

Extract the output type from a tool (inferred from Standard Schema)

## Type Parameters

### T

`T`
