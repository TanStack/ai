---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:609](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L609)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:614](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L614)

TanStack AI addition: Full accumulated content so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:612](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L612)

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:611](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L611)

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
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:610](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L610)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
