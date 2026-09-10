---
id: ApprovalSchemaConfig
title: ApprovalSchemaConfig
---

# Type Alias: ApprovalSchemaConfig

```ts
type ApprovalSchemaConfig = 
  | SchemaInput
  | {
  approve: SchemaInput;
  reject?: SchemaInput;
}
  | {
  approve?: SchemaInput;
  reject: SchemaInput;
};
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:32](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L32)
