---
id: ApprovalSchemaOf
title: ApprovalSchemaOf
---

# Type Alias: ApprovalSchemaOf\<TTool\>

```ts
type ApprovalSchemaOf<TTool> = TTool extends ToolApprovalCapabilityMarker<boolean, infer TSchema> ? TSchema : undefined;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L49)

## Type Parameters

### TTool

`TTool`
