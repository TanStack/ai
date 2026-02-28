---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [types.ts:810](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L810)

Emitted when a tool call starts.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### index?

```ts
optional index: number;
```

Defined in: [types.ts:817](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L817)

Index for parallel tool calls

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

Defined in: [types.ts:813](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L813)

Unique identifier for this tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:815](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L815)

Name of the tool being called

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [types.ts:811](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L811)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
