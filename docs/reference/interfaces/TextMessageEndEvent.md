---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [types.ts:769](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L769)

Emitted when a text message completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:772](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L772)

Message identifier

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
type: "TEXT_MESSAGE_END";
```

Defined in: [types.ts:770](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L770)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
