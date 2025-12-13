---
id: InferToolInput
title: InferToolInput
---

# Type Alias: InferToolInput\<T\>

```ts
type InferToolInput<T> = T extends object ? TInput extends z.ZodType ? z.infer<TInput> : TInput extends JSONSchema ? any : any : any;
```

Defined in: [tools/tool-definition.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L61)

Extract the input type from a tool (inferred from Zod schema, or `any` for JSONSchema)

## Type Parameters

### T

`T`
