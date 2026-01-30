---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [types.ts:791](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L791)

Emitted when tool call arguments are streaming.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### args?

```ts
optional args: string;
```

Defined in: [types.ts:798](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L798)

Full accumulated arguments so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:796](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L796)

Incremental JSON arguments delta

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:794](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L794)

Tool call identifier

***

### type

```ts
type: "TOOL_CALL_ARGS";
```

Defined in: [types.ts:792](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L792)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
