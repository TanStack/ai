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

Defined in: [packages/ai/src/types.ts:419](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L419)

## Type Parameters

### TData

`TData` = `unknown`
