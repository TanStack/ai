---
id: InferToolName
title: InferToolName
---

# Type Alias: InferToolName\<T\>

```ts
type InferToolName<T> = T extends object ? N : never;
```

Defined in: [activities/chat/tools/tool-definition.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L61)

Extract the tool name as a literal type

## Type Parameters

### T

`T`
