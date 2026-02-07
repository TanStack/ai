---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [types.ts:823](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L823)

Emitted when tool call arguments are streaming.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### args?

```ts
optional args: string;
```

Defined in: [types.ts:830](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L830)

Full accumulated arguments so far

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:828](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L828)

Incremental JSON arguments delta

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:826](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L826)

Tool call identifier

***

### type

```ts
type: "TOOL_CALL_ARGS";
```

Defined in: [types.ts:824](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L824)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
