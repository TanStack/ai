---
id: OutputSchemaOf
title: OutputSchemaOf
---

```ts
type OutputSchemaOf<TTool> = TTool extends object ? TOutput extends undefined ? NoSchema : TOutput : NoSchema;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:65

## Type Parameters

### TTool

`TTool`
