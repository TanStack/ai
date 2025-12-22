---
id: InferToolInput
title: InferToolInput
---

# Type Alias: InferToolInput\<T\>

```ts
type InferToolInput<T> = T extends object ? TInput extends z.ZodType ? z.infer<TInput> : TInput extends JSONSchema ? any : any : any;
```

Defined in: [activities/chat/tools/tool-definition.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L66)

Extract the input type from a tool (inferred from Zod schema, or `any` for JSONSchema)

## Type Parameters

### T

`T`
