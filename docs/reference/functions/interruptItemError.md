---
id: interruptItemError
title: interruptItemError
---

# Function: interruptItemError()

```ts
function interruptItemError(
   input, 
   interruptId, 
   code, 
   message, 
   options?): InterruptSubmissionError;
```

Defined in: [packages/ai/src/interrupt-resume.ts:112](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L112)

## Parameters

### input

`Pick`\<[`ValidateInterruptResumeBatchInput`](../interfaces/ValidateInterruptResumeBatchInput.md), `"threadId"` \| `"interruptedRunId"` \| `"generation"`\>

### interruptId

`string`

### code

[`ItemInterruptErrorCode`](../type-aliases/ItemInterruptErrorCode.md)

### message

`string`

### options?

#### path?

readonly (`string` \| `number`)[]

#### retryable?

`boolean`

#### source?

`"server"` \| `"client"`

## Returns

[`InterruptSubmissionError`](../type-aliases/InterruptSubmissionError.md)
