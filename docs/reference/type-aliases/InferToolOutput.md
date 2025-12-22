---
id: InferToolOutput
title: InferToolOutput
---

# Type Alias: InferToolOutput\<T\>

```ts
type InferToolOutput<T> = T extends object ? TOutput extends z.ZodType ? z.infer<TOutput> : TOutput extends JSONSchema ? any : any : any;
```

Defined in: [activities/chat/tools/tool-definition.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L77)

Extract the output type from a tool (inferred from Zod schema, or `any` for JSONSchema)

## Type Parameters

### T

`T`
