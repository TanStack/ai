---
id: ApprovalSchemaOf
title: ApprovalSchemaOf
---

```ts
type ApprovalSchemaOf<TTool> = TTool extends ToolApprovalCapabilityMarker<boolean, infer TSchema> ? TSchema : undefined;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:49

## Type Parameters

### TTool

`TTool`
