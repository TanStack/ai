---
id: InterruptDefinition
title: InterruptDefinition
---

# Interface: InterruptDefinition\<TId, TPayloadSchema, TResponseSchema, TPayload, TPayloadInput\>

Defined in: [packages/ai/src/interrupt-definition.ts:202](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L202)

## Type Parameters

### TId

`TId` *extends* `string`

### TPayloadSchema

`TPayloadSchema` *extends* `PortableSchema` \| `undefined`

### TResponseSchema

`TResponseSchema` *extends* `PortableSchema` \| `undefined`

### TPayload

`TPayload` = `unknown`

### TPayloadInput

`TPayloadInput` = `TPayload`

## Properties

### id

```ts
readonly id: TId;
```

Defined in: [packages/ai/src/interrupt-definition.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L209)

***

### interrupt

```ts
interrupt: <TInput>(input) => GenericInterruptRequestFor<InterruptDefinition<TId, TPayloadSchema, TResponseSchema, TPayload, TPayloadInput>, TPayloadSchema, TPayload>;
```

Defined in: [packages/ai/src/interrupt-definition.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L212)

#### Type Parameters

##### TInput

`TInput`

#### Parameters

##### input

`TInput` & `ValidInterruptInput`\<`TInput`, `TPayloadSchema`, `TPayloadInput`\>

#### Returns

`GenericInterruptRequestFor`\<`InterruptDefinition`\<`TId`, `TPayloadSchema`, `TResponseSchema`, `TPayload`, `TPayloadInput`\>, `TPayloadSchema`, `TPayload`\>

***

### payloadSchema

```ts
readonly payloadSchema: TPayloadSchema;
```

Defined in: [packages/ai/src/interrupt-definition.ts:210](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L210)

***

### responseSchema

```ts
readonly responseSchema: TResponseSchema;
```

Defined in: [packages/ai/src/interrupt-definition.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L211)
