---
id: InputSchemaOf
title: InputSchemaOf
---

# Type Alias: InputSchemaOf\<TTool\>

```ts
type InputSchemaOf<TTool> = TTool extends object ? TInput extends undefined ? NoSchema : TInput : NoSchema;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L57)

## Type Parameters

### TTool

`TTool`
