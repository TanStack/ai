---
id: orderedAssistantBlocks
title: orderedAssistantBlocks
---

```ts
function orderedAssistantBlocks(message): 
  | OrderedAssistantBlock[]
  | undefined;
```

Defined in: packages/ai/src/utilities/block-order.ts:58

The blocks of an assistant message in map order, or undefined when the
message has no map or the map does not match the message. A map matches
when it uses each `thinking` entry and each `toolCalls` entry exactly once,
and its text lengths add up to the length of the text content (`null`
content counts as no text). Readers use the default order when this
returns undefined.

## Parameters

### message

[`ModelMessage`](../interfaces/ModelMessage.md)

## Returns

  \| [`OrderedAssistantBlock`](../type-aliases/OrderedAssistantBlock.md)[]
  \| `undefined`
