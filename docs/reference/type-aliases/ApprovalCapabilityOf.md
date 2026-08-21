---
id: ApprovalCapabilityOf
title: ApprovalCapabilityOf
---

# Type Alias: ApprovalCapabilityOf\<TTool\>

```ts
type ApprovalCapabilityOf<TTool> = TTool extends ToolApprovalCapabilityMarker<infer TNeeds, unknown> ? TNeeds : false;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L44)

## Type Parameters

### TTool

`TTool`
