---
id: GenericInterruptContinuationReadResult
title: GenericInterruptContinuationReadResult
---

```ts
type GenericInterruptContinuationReadResult = 
  | {
  status: "absent";
}
  | {
  message: string;
  status: "invalid";
}
  | {
  status: "ok";
  value: GenericInterruptContinuation;
};
```

Defined in: packages/ai/src/generic-interrupt-continuation.ts:29
