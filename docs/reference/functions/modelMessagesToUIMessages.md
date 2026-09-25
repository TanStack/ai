---
id: modelMessagesToUIMessages
title: modelMessagesToUIMessages
---

```ts
function modelMessagesToUIMessages(modelMessages): UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/messages.ts:1216](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/messages.ts#L1216)

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

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

Array of UIMessages
