---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:816](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L816)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:823](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L823)

Full accumulated content so far (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:821](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L821)

The incremental content token

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:819](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L819)

Message identifier

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:750](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L750)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:817](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L817)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
