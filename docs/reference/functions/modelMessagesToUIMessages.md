---
id: modelMessagesToUIMessages
title: modelMessagesToUIMessages
---

# Function: modelMessagesToUIMessages()

```ts
function modelMessagesToUIMessages(modelMessages): UIMessage[];
```

Defined in: [activities/chat/messages.ts:247](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/messages.ts#L247)

Convert an array of ModelMessages to UIMessages

This handles merging tool result messages with their corresponding assistant messages

## Parameters

### modelMessages

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

Array of ModelMessages to convert

## Returns

[`UIMessage`](../interfaces/UIMessage.md)[]

Array of UIMessages
