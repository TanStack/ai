---
id: MessagePart
title: MessagePart
---

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
  | UIResourcePart
  | SubagentPart;
```

Defined in: [packages/ai/src/types.ts:525](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L525)

## Type Parameters

### TData

`TData` = `unknown`
