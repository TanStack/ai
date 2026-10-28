---
id: ApprovalSchemaConfig
title: ApprovalSchemaConfig
---

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

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:32
