---
id: modelMessageToUIMessage
title: modelMessageToUIMessage
---

# Function: modelMessageToUIMessage()

```ts
function modelMessageToUIMessage(modelMessage, id?): UIMessage;
```

Defined in: [activities/chat/messages.ts:305](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/messages.ts#L305)

Convert a ModelMessage to UIMessage

This conversion creates a parts-based structure:
- content field → TextPart
- toolCalls array → ToolCallPart[]
- role="tool" messages should be converted separately and merged

## Parameters

### modelMessage

[`ModelMessage`](../interfaces/ModelMessage.md)

The ModelMessage to convert

### id?

`string`

Optional ID for the UIMessage (generated if not provided)

## Returns

[`UIMessage`](../interfaces/UIMessage.md)

A UIMessage with parts
