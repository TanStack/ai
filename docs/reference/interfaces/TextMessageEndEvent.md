---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

Emitted when a text message completes.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:694](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L694)

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
type: "TEXT_MESSAGE_END";
```

Defined in: [types.ts:693](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L693)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
