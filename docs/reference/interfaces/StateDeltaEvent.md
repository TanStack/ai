---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [types.ts:698](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L698)

Emitted for incremental state updates.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### delta

```ts
delta: object[];
```

Defined in: [types.ts:700](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L700)

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

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

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
type: "STATE_DELTA";
```

Defined in: [types.ts:699](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L699)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
