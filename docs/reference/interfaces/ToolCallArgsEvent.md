---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [types.ts:851](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L851)

Emitted when tool call arguments are streaming.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### args?

```ts
optional args: string;
```

Defined in: [types.ts:858](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L858)

Full accumulated arguments so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:856](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L856)

Incremental JSON arguments delta

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:854](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L854)

Tool call identifier

***

### type

```ts
type: "TOOL_CALL_ARGS";
```

Defined in: [types.ts:852](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L852)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
