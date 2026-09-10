---
id: InterruptDefinitionOptions
title: InterruptDefinitionOptions
---

# Interface: InterruptDefinitionOptions\<TId, TPayloadSchema, TResponseSchema\>

Defined in: [packages/ai/src/interrupt-definition.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L44)

## Type Parameters

### TId

`TId` *extends* `string`

### TPayloadSchema

`TPayloadSchema` *extends* `PortableSchema` \| `undefined`

### TResponseSchema

`TResponseSchema` *extends* `PortableSchema` \| `undefined`

## Properties

### id

```ts
id: TId;
```

Defined in: [packages/ai/src/interrupt-definition.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L49)

***

### payloadSchema?

```ts
optional payloadSchema?: TPayloadSchema;
```

Defined in: [packages/ai/src/interrupt-definition.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L50)

***

### responseSchema?

```ts
optional responseSchema?: TResponseSchema;
```

Defined in: [packages/ai/src/interrupt-definition.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L51)
