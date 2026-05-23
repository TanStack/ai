---
id: MessagePart
title: MessagePart
---

# Type Alias: MessagePart\<TData\>

```ts
type MessagePart<TData> = 
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart
  | ToolResultPart
  | ThinkingPart
| StructuredOutputPart<TData>;
```

Defined in: [packages/typescript/ai/src/types.ts:406](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L406)

## Type Parameters

### TData

`TData` = `unknown`
