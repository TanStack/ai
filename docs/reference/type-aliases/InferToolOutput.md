---
id: InferToolOutput
title: InferToolOutput
---

# Type Alias: InferToolOutput\<T\>

```ts
type InferToolOutput<T> = T extends object ? TOutput extends z.ZodType ? z.infer<TOutput> : TOutput extends JSONSchema ? any : any : any;
```

Defined in: [tools/tool-definition.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L72)

Extract the output type from a tool (inferred from Zod schema, or `any` for JSONSchema)

## Type Parameters

### T

`T`
