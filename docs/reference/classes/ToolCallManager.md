---
id: ToolCallManager
title: ToolCallManager
---

# Class: ToolCallManager

Defined in: [activities/chat/tools/tool-calls.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L46)

Manages tool call accumulation and execution for the chat() method's automatic tool execution loop.

Responsibilities:
- Accumulates streaming tool call events (ID, name, arguments)
- Validates tool calls (filters out incomplete ones)
- Executes tool `execute` functions with parsed arguments
- Emits `TOOL_CALL_END` events for client visibility
- Returns tool result messages for conversation history

This class is used internally by the AI.chat() method to handle the automatic
tool execution loop. It can also be used independently for custom tool execution logic.

## Example

```typescript
const manager = new ToolCallManager(tools);

// During streaming, accumulate tool calls
for await (const chunk of stream) {
  if (chunk.type === 'TOOL_CALL_START') {
    manager.addToolCallStartEvent(chunk);
  } else if (chunk.type === 'TOOL_CALL_ARGS') {
    manager.addToolCallArgsEvent(chunk);
  }
}

// After stream completes, execute tools
if (manager.hasToolCalls()) {
  const toolResults = yield* manager.executeTools(finishEvent);
  messages = [...messages, ...toolResults];
  manager.clear();
}
```

## Constructors

### Constructor

```ts
new ToolCallManager(tools): ToolCallManager;
```

Defined in: [activities/chat/tools/tool-calls.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L50)

#### Parameters

##### tools

readonly [`Tool`](../interfaces/Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>[]

#### Returns

`ToolCallManager`

## Methods

### addToolCallArgsEvent()

```ts
addToolCallArgsEvent(event): void;
```

Defined in: [activities/chat/tools/tool-calls.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L72)

Add a TOOL_CALL_ARGS event to accumulate arguments (AG-UI)

#### Parameters

##### event

[`ToolCallArgsEvent`](../interfaces/ToolCallArgsEvent.md)

#### Returns

`void`

***

### addToolCallStartEvent()

```ts
addToolCallStartEvent(event): void;
```

Defined in: [activities/chat/tools/tool-calls.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L57)

Add a TOOL_CALL_START event to begin tracking a tool call (AG-UI)

#### Parameters

##### event

[`ToolCallStartEvent`](../interfaces/ToolCallStartEvent.md)

#### Returns

`void`

***

### clear()

```ts
clear(): void;
```

Defined in: [activities/chat/tools/tool-calls.ts:215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L215)

Clear the tool calls map for the next iteration

#### Returns

`void`

***

### completeToolCall()

```ts
completeToolCall(event): void;
```

Defined in: [activities/chat/tools/tool-calls.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L86)

Complete a tool call with its final input
Called when TOOL_CALL_END is received

#### Parameters

##### event

[`ToolCallEndEvent`](../interfaces/ToolCallEndEvent.md)

#### Returns

`void`

***

### executeTools()

```ts
executeTools(finishEvent): AsyncGenerator<ToolCallEndEvent, ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
| null>[], void>;
```

Defined in: [activities/chat/tools/tool-calls.ts:118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L118)

Execute all tool calls and return tool result messages
Yields TOOL_CALL_END events for streaming

#### Parameters

##### finishEvent

[`RunFinishedEvent`](../interfaces/RunFinishedEvent.md)

RUN_FINISHED event from the stream

#### Returns

`AsyncGenerator`\<[`ToolCallEndEvent`](../interfaces/ToolCallEndEvent.md), [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[], `void`\>

***

### getToolCalls()

```ts
getToolCalls(): ToolCall[];
```

Defined in: [activities/chat/tools/tool-calls.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L107)

Get all complete tool calls (filtered for valid ID and name)

#### Returns

[`ToolCall`](../interfaces/ToolCall.md)[]

***

### hasToolCalls()

```ts
hasToolCalls(): boolean;
```

Defined in: [activities/chat/tools/tool-calls.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L100)

Check if there are any complete tool calls to execute

#### Returns

`boolean`
