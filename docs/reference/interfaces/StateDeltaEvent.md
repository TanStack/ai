---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [types.ts:935](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L935)

Emitted to provide an incremental state update.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### delta

```ts
delta: Record<string, unknown>;
```

Defined in: [types.ts:938](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L938)

The state changes to apply

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:758](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L758)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:754](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L754)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "STATE_DELTA";
```

Defined in: [types.ts:936](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L936)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
