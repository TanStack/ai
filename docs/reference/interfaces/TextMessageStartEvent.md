---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [types.ts:600](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L600)

Emitted when a text message starts.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:602](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L602)

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### role

```ts
role: "assistant";
```

Defined in: [types.ts:603](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L603)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "TEXT_MESSAGE_START";
```

Defined in: [types.ts:601](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L601)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
