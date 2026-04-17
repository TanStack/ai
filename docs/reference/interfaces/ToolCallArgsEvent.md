---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [types.ts:861](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L861)

Emitted when tool call arguments are streaming.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### args?

```ts
optional args: string;
```

Defined in: [types.ts:868](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L868)

Full accumulated arguments so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:866](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L866)

Incremental JSON arguments delta

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:864](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L864)

Tool call identifier

***

### type

```ts
type: "TOOL_CALL_ARGS";
```

Defined in: [types.ts:862](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L862)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
