---
id: GenericInterruptRequest
title: GenericInterruptRequest
---

# Type Alias: GenericInterruptRequest\<TDefinition\>

```ts
type GenericInterruptRequest<TDefinition> = [TDefinition] extends [never] ? never : TDefinition extends InterruptDefinition<any, infer TPayloadSchema, any, infer TPayload> ? GenericInterruptRequestFor<TDefinition, TPayloadSchema, TPayload> : GenericInterruptRequestBase<TDefinition>;
```

Defined in: [packages/ai/src/interrupt-definition.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L103)

## Type Parameters

### TDefinition

`TDefinition` *extends* [`InterruptDefinition`](../interfaces/InterruptDefinition.md)\<`any`, `any`, `any`, `any`\>
