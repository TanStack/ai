---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [types.ts:838](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L838)

Emitted when a tool call starts.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### index?

```ts
optional index: number;
```

Defined in: [types.ts:845](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L845)

Index for parallel tool calls

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

Defined in: [types.ts:841](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L841)

Unique identifier for this tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:843](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L843)

Name of the tool being called

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [types.ts:839](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L839)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
