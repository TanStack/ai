---
id: OutputSchemaOf
title: OutputSchemaOf
---

# Type Alias: OutputSchemaOf\<TTool\>

```ts
type OutputSchemaOf<TTool> = TTool extends object ? TOutput extends undefined ? NoSchema : TOutput : NoSchema;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L65)

## Type Parameters

### TTool

`TTool`
