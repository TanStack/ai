---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [types.ts:944](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L944)

Custom event for extensibility.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### name

```ts
name: string;
```

Defined in: [types.ts:947](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L947)

Custom event name

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
type: "CUSTOM";
```

Defined in: [types.ts:945](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L945)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)

***

### value?

```ts
optional value: unknown;
```

Defined in: [types.ts:949](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L949)

Custom event value
