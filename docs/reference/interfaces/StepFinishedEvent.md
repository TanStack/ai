---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [types.ts:862](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L862)

Emitted when a thinking/reasoning step finishes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:869](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L869)

Full accumulated thinking content (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:867](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L867)

Incremental thinking content

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:865](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L865)

Step identifier

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
type: "STEP_FINISHED";
```

Defined in: [types.ts:863](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L863)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
