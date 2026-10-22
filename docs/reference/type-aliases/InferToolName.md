---
id: InferToolName
title: InferToolName
---

```ts
type InferToolName<T> = T extends object ? N : never;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:188

Extract the tool name as a literal type

## Type Parameters

### T

`T`
