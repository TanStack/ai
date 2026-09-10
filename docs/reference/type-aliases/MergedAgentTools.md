---
id: MergedAgentTools
title: MergedAgentTools
---

# Type Alias: MergedAgentTools\<TServerTools\>

```ts
type MergedAgentTools<TServerTools> = ReadonlyArray<
  | TServerTools[number]
| ClientToolDeclaration>;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L325)

## Type Parameters

### TServerTools

`TServerTools` *extends* `ReadonlyArray`\<[`AnyTool`](AnyTool.md)\>
