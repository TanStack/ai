---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [types.ts:770](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L770)

Emitted for incremental state updates.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### delta

```ts
delta: object[];
```

Defined in: [types.ts:772](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L772)

#### op

```ts
op: "add" | "remove" | "replace";
```

#### path

```ts
path: string;
```

#### value?

```ts
optional value: unknown;
```

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

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
type: "STATE_DELTA";
```

Defined in: [types.ts:771](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L771)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
