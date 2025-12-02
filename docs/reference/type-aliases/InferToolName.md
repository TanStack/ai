---
id: InferToolName
title: InferToolName
---

# Type Alias: InferToolName\<T\>

```ts
type InferToolName<T> = T extends object ? N : never;
```

Defined in: [tools/tool-definition.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L56)

Extract the tool name as a literal type

## Type Parameters

### T

`T`
