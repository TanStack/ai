---
id: ToolCallManager
title: ToolCallManager
---

# Class: ToolCallManager

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:83](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L83)

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L87)

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:113](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L113)

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:94](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L94)

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:262](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L262)

Clear the tool calls map for the next iteration

#### Returns

`void`

***

### completeToolCall()

```ts
completeToolCall(event): void;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L127)

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:162](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L162)

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:151](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L151)

Get all complete tool calls (filtered for valid ID and name)

#### Returns

[`ToolCall`](../interfaces/ToolCall.md)[]

***

### hasToolCalls()

```ts
hasToolCalls(): boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-calls.ts:144](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L144)

Check if there are any complete tool calls to execute

#### Returns

`boolean`
