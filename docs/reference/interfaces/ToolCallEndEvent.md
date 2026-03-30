---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:874](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L874)

Emitted when a tool call completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:881](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L881)

Final parsed input arguments

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

### result?

```ts
optional result: string;
```

Defined in: [types.ts:883](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L883)

Tool execution result (if executed)

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

Defined in: [types.ts:877](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L877)

Tool call identifier

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:879](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L879)

Name of the tool

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:875](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L875)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
