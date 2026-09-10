---
id: InterruptResolutionCollection
title: InterruptResolutionCollection
---

# Interface: InterruptResolutionCollection\<TDefinitions\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L135)

## Type Parameters

### TDefinitions

`TDefinitions` *extends* `AnyInterruptDefinition` = `AnyInterruptDefinition`

## Properties

### all

```ts
all: {
  (): readonly GenericInterruptResolution<TDefinitions>[];
<TSelected>  (...definitions): readonly GenericInterruptResolution<TSelected[number]>[];
};
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L145)

#### Call Signature

```ts
(): readonly GenericInterruptResolution<TDefinitions>[];
```

##### Returns

readonly [`GenericInterruptResolution`](../type-aliases/GenericInterruptResolution.md)\<`TDefinitions`\>[]

#### Call Signature

```ts
<TSelected>(...definitions): readonly GenericInterruptResolution<TSelected[number]>[];
```

##### Type Parameters

###### TSelected

`TSelected` *extends* readonly `TDefinitions`[]

##### Parameters

###### definitions

...`TSelected`

##### Returns

readonly [`GenericInterruptResolution`](../type-aliases/GenericInterruptResolution.md)\<`TSelected`\[`number`\]\>[]

***

### for

```ts
for: <TDefinition>(definition) => readonly GenericInterruptResolution<TDefinition>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L138)

#### Type Parameters

##### TDefinition

`TDefinition` *extends* `AnyInterruptDefinition`

#### Parameters

##### definition

`TDefinition`

#### Returns

readonly [`GenericInterruptResolution`](../type-aliases/GenericInterruptResolution.md)\<`TDefinition`\>[]
