---
id: createInterruptBinding
title: createInterruptBinding
---

```ts
function createInterruptBinding(request, fields?): InterruptPreEmissionData;
```

Defined in: packages/ai/src/interrupt-definition.ts:221

## Parameters

### request

`GenericInterruptRequestBase`\<[`InterruptDefinition`](../interfaces/InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>\>

### fields?

`Pick`\<[`InterruptBindingDescriptor`](../interfaces/InterruptBindingDescriptor.md), `"threadId"` \| `"interruptedRunId"` \| `"generation"` \| `"batchIndex"`\> = `{}`

## Returns

`InterruptPreEmissionData`
