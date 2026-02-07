---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [types.ts:884](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L884)

Emitted to provide an incremental state update.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### delta

```ts
delta: Record<string, unknown>;
```

Defined in: [types.ts:887](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L887)

The state changes to apply

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:722](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L722)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:724](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L724)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:720](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L720)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "STATE_DELTA";
```

Defined in: [types.ts:885](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L885)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
