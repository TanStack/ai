---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:788](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L788)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:795](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L795)

Full accumulated content so far (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:793](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L793)

The incremental content token

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:791](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L791)

Message identifier

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
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:789](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L789)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
