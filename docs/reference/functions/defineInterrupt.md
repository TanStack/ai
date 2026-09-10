---
id: defineInterrupt
title: defineInterrupt
---

# Function: defineInterrupt()

## Call Signature

```ts
function defineInterrupt<TId, TPayloadSchema, TResponseSchema>(options): DefinedInterruptDefinition<TId, TPayloadSchema, TResponseSchema, InferSchemaOutput<TPayloadSchema>, InferSchemaInput<TPayloadSchema>>;
```

Defined in: [packages/ai/src/interrupt-definition.ts:418](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L418)

### Type Parameters

#### TId

`TId` *extends* `string`

#### TPayloadSchema

`TPayloadSchema` *extends* `PortableSchema`

#### TResponseSchema

`TResponseSchema` *extends* `PortableSchema`

### Parameters

#### options

##### id

`TId`

##### payloadSchema

`TPayloadSchema`

##### responseSchema

`TResponseSchema`

### Returns

`DefinedInterruptDefinition`\<`TId`, `TPayloadSchema`, `TResponseSchema`, `InferSchemaOutput`\<`TPayloadSchema`\>, `InferSchemaInput`\<`TPayloadSchema`\>\>

## Call Signature

```ts
function defineInterrupt<TId, TPayloadSchema>(options): DefinedInterruptDefinition<TId, TPayloadSchema, undefined, InferSchemaOutput<TPayloadSchema>, InferSchemaInput<TPayloadSchema>>;
```

Defined in: [packages/ai/src/interrupt-definition.ts:433](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L433)

### Type Parameters

#### TId

`TId` *extends* `string`

#### TPayloadSchema

`TPayloadSchema` *extends* `PortableSchema`

### Parameters

#### options

##### id

`TId`

##### payloadSchema

`TPayloadSchema`

##### responseSchema?

`undefined`

### Returns

`DefinedInterruptDefinition`\<`TId`, `TPayloadSchema`, `undefined`, `InferSchemaOutput`\<`TPayloadSchema`\>, `InferSchemaInput`\<`TPayloadSchema`\>\>

## Call Signature

```ts
function defineInterrupt<TId, TResponseSchema>(options): DefinedInterruptDefinition<TId, undefined, TResponseSchema, undefined, undefined>;
```

Defined in: [packages/ai/src/interrupt-definition.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-definition.ts#L447)

### Type Parameters

#### TId

`TId` *extends* `string`

#### TResponseSchema

`TResponseSchema` *extends* `PortableSchema`

### Parameters

#### options

##### id

`TId`

##### payloadSchema?

`undefined`

##### responseSchema

`TResponseSchema`

### Returns

`DefinedInterruptDefinition`\<`TId`, `undefined`, `TResponseSchema`, `undefined`, `undefined`\>
