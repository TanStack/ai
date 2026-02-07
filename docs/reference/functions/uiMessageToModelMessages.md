---
id: uiMessageToModelMessages
title: uiMessageToModelMessages
---

# Function: uiMessageToModelMessages()

```ts
function uiMessageToModelMessages(uiMessage): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [activities/chat/messages.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/messages.ts#L81)

Convert a UIMessage to ModelMessage(s)

This conversion handles the parts-based structure:
- Text parts → content field (string or as part of ContentPart array)
- Multimodal parts (image, audio, video, document) → ContentPart array
- ToolCall parts → toolCalls array
- ToolResult parts → separate role="tool" messages

## Parameters

### uiMessage

[`UIMessage`](../interfaces/UIMessage.md)

The UIMessage to convert

## Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

An array of ModelMessages (may be multiple if tool results are present)
