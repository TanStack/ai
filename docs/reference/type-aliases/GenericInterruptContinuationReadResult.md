---
id: GenericInterruptContinuationReadResult
title: GenericInterruptContinuationReadResult
---

# Type Alias: GenericInterruptContinuationReadResult

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

Defined in: [packages/ai/src/generic-interrupt-continuation.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/generic-interrupt-continuation.ts#L29)
