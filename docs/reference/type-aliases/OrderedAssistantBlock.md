---
id: OrderedAssistantBlock
title: OrderedAssistantBlock
---

```ts
type OrderedAssistantBlock = 
  | {
  thinking: NonNullable<ModelMessage["thinking"]>[number];
  type: "thinking";
}
  | {
  text: string;
  type: "text";
}
  | {
  toolCall: ToolCall;
  type: "tool-call";
};
```

Defined in: [packages/ai/src/utilities/block-order.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/block-order.ts#L42)

A block of an assistant message, resolved from its order map.
