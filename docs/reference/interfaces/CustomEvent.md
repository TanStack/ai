---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [types.ts:783](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L783)

Custom event for extensibility.
Used for features not covered by standard AG-UI events (e.g., approval flows).

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### name

```ts
name: string;
```

Defined in: [types.ts:785](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L785)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L627)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "CUSTOM";
```

Defined in: [types.ts:784](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L784)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)

***

### value

```ts
value: unknown;
```

Defined in: [types.ts:786](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L786)
