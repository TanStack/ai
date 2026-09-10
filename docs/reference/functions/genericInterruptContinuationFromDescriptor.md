---
id: genericInterruptContinuationFromDescriptor
title: genericInterruptContinuationFromDescriptor
---

# Function: genericInterruptContinuationFromDescriptor()

```ts
function genericInterruptContinuationFromDescriptor(interrupt): 
  | GenericInterruptContinuation
  | undefined;
```

Defined in: [packages/ai/src/generic-interrupt-continuation.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/generic-interrupt-continuation.ts#L123)

Build the resume-metadata continuation from an outbound AG-UI interrupt.

Returns `undefined` when the descriptor is not a first-party generic item.

## Parameters

### interrupt

`Interrupt`

## Returns

  \| [`GenericInterruptContinuation`](../interfaces/GenericInterruptContinuation.md)
  \| `undefined`
