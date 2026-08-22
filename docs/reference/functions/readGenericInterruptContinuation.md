---
id: readGenericInterruptContinuation
title: readGenericInterruptContinuation
---

# Function: readGenericInterruptContinuation()

```ts
function readGenericInterruptContinuation(metadata): GenericInterruptContinuationReadResult;
```

Defined in: [packages/ai/src/generic-interrupt-continuation.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/generic-interrupt-continuation.ts#L50)

Read one generic request from `resume[].metadata`.

Missing key means this resume item is not a first-party generic continuation.
A present key that fails the shape is a protocol error.

## Parameters

### metadata

`unknown`

## Returns

[`GenericInterruptContinuationReadResult`](../type-aliases/GenericInterruptContinuationReadResult.md)
