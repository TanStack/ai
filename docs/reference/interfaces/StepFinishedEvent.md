---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [types.ts:893](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L893)

Emitted when a thinking/reasoning step finishes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### content?

```ts
optional content: string;
```

Defined in: [types.ts:900](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L900)

Full accumulated thinking content (optional, for debugging)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:898](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L898)

Incremental thinking content

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:896](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L896)

Step identifier

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
type: "STEP_FINISHED";
```

Defined in: [types.ts:894](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L894)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
