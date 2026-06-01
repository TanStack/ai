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

Defined in: [packages/ai/src/types.ts:408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L408)

## Type Parameters

### TData

`TData` = `unknown`
