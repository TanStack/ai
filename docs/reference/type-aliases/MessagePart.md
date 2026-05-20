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

Defined in: [packages/typescript/ai/src/types.ts:405](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L405)

## Type Parameters

### TData

`TData` = `unknown`
