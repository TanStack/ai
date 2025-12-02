---
id: uiMessageToModelMessages
title: uiMessageToModelMessages
---

# Function: uiMessageToModelMessages()

```ts
function uiMessageToModelMessages(uiMessage): ModelMessage[];
```

Defined in: [message-converters.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/message-converters.ts#L46)

Convert a UIMessage to ModelMessage(s)

This conversion handles the parts-based structure:
- Text parts → content field
- ToolCall parts → toolCalls array
- ToolResult parts → separate role="tool" messages

## Parameters

### uiMessage

[`UIMessage`](../interfaces/UIMessage.md)

The UIMessage to convert

## Returns

[`ModelMessage`](../interfaces/ModelMessage.md)[]

An array of ModelMessages (may be multiple if tool results are present)
