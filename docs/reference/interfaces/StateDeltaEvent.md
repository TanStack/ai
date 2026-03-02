---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [types.ts:912](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L912)

Emitted to provide an incremental state update.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### delta

```ts
delta: Record<string, unknown>;
```

Defined in: [types.ts:915](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L915)

The state changes to apply

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:750](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L750)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "STATE_DELTA";
```

Defined in: [types.ts:913](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L913)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
