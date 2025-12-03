---
id: InferToolOutput
title: InferToolOutput
---

# Type Alias: InferToolOutput\<T\>

```ts
type InferToolOutput<T> = T extends object ? TOutput extends z.ZodType ? z.infer<TOutput> : any : any;
```

Defined in: [tools/tool-definition.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L70)

Extract the output type from a tool (inferred from Zod schema)

## Type Parameters

### T

`T`
