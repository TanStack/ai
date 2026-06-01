---
id: InferToolName
title: InferToolName
---

# Type Alias: InferToolName\<T\>

```ts
type InferToolName<T> = T extends object ? N : never;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L72)

Extract the tool name as a literal type

## Type Parameters

### T

`T`
