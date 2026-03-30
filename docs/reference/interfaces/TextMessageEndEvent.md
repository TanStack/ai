---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [types.ts:835](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L835)

Emitted when a text message completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:838](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L838)

Message identifier

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
type: "TEXT_MESSAGE_END";
```

Defined in: [types.ts:836](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L836)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
