---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [types.ts:672](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L672)

Emitted when a text message starts.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:674](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L674)

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

### role

```ts
role: "assistant";
```

Defined in: [types.ts:675](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L675)

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
type: "TEXT_MESSAGE_START";
```

Defined in: [types.ts:673](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L673)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
