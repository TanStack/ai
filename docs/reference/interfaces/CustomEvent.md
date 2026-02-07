---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [types.ts:893](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L893)

Custom event for extensibility.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### data?

```ts
optional data: unknown;
```

Defined in: [types.ts:898](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L898)

Custom event data

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

### name

```ts
name: string;
```

Defined in: [types.ts:896](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L896)

Custom event name

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
type: "CUSTOM";
```

Defined in: [types.ts:894](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L894)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
