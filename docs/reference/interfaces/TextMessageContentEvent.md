---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:763](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L763)

Full accumulated content so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:761](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L761)

The incremental content token

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:759](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L759)

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
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:757](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L757)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
