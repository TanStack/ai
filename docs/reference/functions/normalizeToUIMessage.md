---
id: normalizeToUIMessage
title: normalizeToUIMessage
---

# Function: normalizeToUIMessage()

```ts
function normalizeToUIMessage(message, generateId): UIMessage;
```

Defined in: [message-converters.ts:240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/message-converters.ts#L240)

Normalize a message (UIMessage or ModelMessage) to a UIMessage
Ensures the message has an ID and createdAt timestamp

## Parameters

### message

Either a UIMessage or ModelMessage

[`ModelMessage`](../interfaces/ModelMessage.md) | [`UIMessage`](../interfaces/UIMessage.md)

### generateId

() => `string`

Function to generate a message ID if needed

## Returns

[`UIMessage`](../interfaces/UIMessage.md)

A UIMessage with guaranteed id and createdAt
