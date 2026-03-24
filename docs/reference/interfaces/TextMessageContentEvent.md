---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [types.ts:817](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L817)

Emitted when text content is generated (streaming tokens).

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:824](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L824)

Full accumulated content so far (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:822](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L822)

The incremental content token

***

### messageId

```ts
messageId: string;
```

Defined in: [types.ts:820](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L820)

Message identifier

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:751](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L751)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L749)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "TEXT_MESSAGE_CONTENT";
```

Defined in: [types.ts:818](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L818)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
