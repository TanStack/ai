---
id: MergedAgentTools
title: MergedAgentTools
---

```ts
type MergedAgentTools<TServerTools> = ReadonlyArray<
  | TServerTools[number]
| ClientToolDeclaration>;
```

Defined in: packages/ai/src/utilities/chat-params.ts:319

## Type Parameters

### TServerTools

`TServerTools` *extends* `ReadonlyArray`\<[`AnyTool`](AnyTool.md)\>
