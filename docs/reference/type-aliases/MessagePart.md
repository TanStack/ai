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
  | StructuredOutputPart<TData>
  | UIResourcePart;
```

Defined in: [packages/ai/src/types.ts:504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L504)

## Type Parameters

### TData

`TData` = `unknown`
