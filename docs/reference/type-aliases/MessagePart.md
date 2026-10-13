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
  | ActivityPart
  | StructuredOutputPart<TData>
  | UIResourcePart
  | SubagentPart;
```

Defined in: [packages/ai/src/types.ts:674](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L674)

## Type Parameters

### TData

`TData` = `unknown`
