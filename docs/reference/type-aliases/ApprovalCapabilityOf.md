---
id: ApprovalCapabilityOf
title: ApprovalCapabilityOf
---

```ts
type ApprovalCapabilityOf<TTool> = TTool extends ToolApprovalCapabilityMarker<infer TNeeds, unknown> ? TNeeds : false;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:44

## Type Parameters

### TTool

`TTool`
