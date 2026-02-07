---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:836](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L836)

Emitted when a tool call completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:843](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L843)

Final parsed input arguments

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

### result?

```ts
optional result: string;
```

Defined in: [types.ts:845](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L845)

Tool execution result (if executed)

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

Defined in: [types.ts:839](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L839)

Tool call identifier

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:841](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L841)

Name of the tool

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:837](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L837)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
