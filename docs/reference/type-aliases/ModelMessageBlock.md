---
id: ModelMessageBlock
title: ModelMessageBlock
---

```ts
type ModelMessageBlock = 
  | {
  index: number;
  type: "thinking";
}
  | {
  length: number;
  type: "text";
}
  | {
  id: string;
  type: "tool-call";
};
```

Defined in: packages/ai/src/types.ts:423

One block of an assistant `ModelMessage`, in the order the model sent it.
Each entry points into a field of the message. See `ModelMessage.blockOrder`.
