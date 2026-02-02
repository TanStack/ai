---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [types.ts:778](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L778)

Emitted when a tool call starts.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### index?

```ts
optional index: number;
```

Defined in: [types.ts:785](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L785)

Index for parallel tool calls

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

Defined in: [types.ts:781](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L781)

Unique identifier for this tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:783](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L783)

Name of the tool being called

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [types.ts:779](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L779)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
