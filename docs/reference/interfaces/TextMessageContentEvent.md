---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:681](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L681)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:686](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L686)

TanStack AI addition: Full accumulated content so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:684](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L684)

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:683](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L683)

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
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:682](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L682)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
