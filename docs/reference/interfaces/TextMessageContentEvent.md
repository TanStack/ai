---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:822](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L822)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:829](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L829)

Full accumulated content so far (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:827](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L827)

The incremental content token

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:825](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L825)

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
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:823](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L823)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
