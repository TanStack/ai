---
id: validateInterruptResumeBatch
title: validateInterruptResumeBatch
---

# Function: validateInterruptResumeBatch()

```ts
function validateInterruptResumeBatch(input): Promise<ValidatedInterruptResumeBatch>;
```

Defined in: [packages/ai/src/interrupt-resume.ts:243](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L243)

Validate and translate a complete interrupt batch before any tool executes.
Used by ephemeral chat resume; a durable layer may share the same validator.

## Parameters

### input

[`ValidateInterruptResumeBatchInput`](../interfaces/ValidateInterruptResumeBatchInput.md)

## Returns

`Promise`\<[`ValidatedInterruptResumeBatch`](../interfaces/ValidatedInterruptResumeBatch.md)\>
