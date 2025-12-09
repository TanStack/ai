---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [types.ts:711](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L711)

Custom event for extensibility.
Used for features not covered by standard AG-UI events (e.g., approval flows).

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### name

```ts
name: string;
```

Defined in: [types.ts:713](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L713)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "CUSTOM";
```

Defined in: [types.ts:712](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L712)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)

***

### value

```ts
value: unknown;
```

Defined in: [types.ts:714](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L714)
