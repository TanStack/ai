---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [types.ts:861](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L861)

Custom event for extensibility.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### data?

```ts
optional data: unknown;
```

Defined in: [types.ts:866](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L866)

Custom event data

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L690)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### name

```ts
name: string;
```

Defined in: [types.ts:864](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L864)

Custom event name

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:688](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L688)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "CUSTOM";
```

Defined in: [types.ts:862](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L862)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
