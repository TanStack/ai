---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [types.ts:890](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L890)

Emitted when a thinking/reasoning step finishes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:897](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L897)

Full accumulated thinking content (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:895](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L895)

Incremental thinking content

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:893](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L893)

Step identifier

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
type: "STEP_FINISHED";
```

Defined in: [types.ts:891](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L891)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
