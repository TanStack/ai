---
id: ToolCallManager
title: ToolCallManager
---

# Class: ToolCallManager\<TToolsOrContext, TContext\>

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L123)

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

## Type Parameters

### TToolsOrContext

`TToolsOrContext` = `ReadonlyArray`\<[`AnyTool`](../type-aliases/AnyTool.md)\>

### TContext

`TContext` = `TToolsOrContext` *extends* `ReadonlyArray`\<[`AnyTool`](../type-aliases/AnyTool.md)\> ? `ContextFromTools`\<`TToolsOrContext`\> : `TToolsOrContext`

## Constructors

### Constructor

```ts
new ToolCallManager<TToolsOrContext, TContext>(tools): ToolCallManager<TToolsOrContext, TContext>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L134)

#### Parameters

##### tools

`TToolsOrContext` *extends* readonly [`AnyTool`](../type-aliases/AnyTool.md)[] ? `TToolsOrContext`\<`TToolsOrContext`\> : readonly [`AnyTool`](../type-aliases/AnyTool.md)[]

#### Returns

`ToolCallManager`\<`TToolsOrContext`, `TContext`\>

## Methods

### addToolCallArgsEvent()

```ts
addToolCallArgsEvent(event): void;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L164)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L145)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L324)

Clear the tool calls map for the next iteration

#### Returns

`void`

***

### completeToolCall()

```ts
completeToolCall(event): void;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:178](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L178)

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
executeTools(finishEvent, ...contextArgs): AsyncGenerator<ToolCallEndEvent, ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
| null>[], void>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:213](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L213)

Execute all tool calls and return tool result messages
Yields TOOL_CALL_END events for streaming

#### Parameters

##### finishEvent

[`RunFinishedEvent`](../interfaces/RunFinishedEvent.md)

RUN_FINISHED event from the stream

##### contextArgs

...`ExecuteToolsContextArgs`\<`TContext`\>

#### Returns

`AsyncGenerator`\<[`ToolCallEndEvent`](../interfaces/ToolCallEndEvent.md), [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[], `void`\>

***

### getToolCalls()

```ts
getToolCalls(): ToolCall<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:202](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L202)

Get all complete tool calls (filtered for valid ID and name)

#### Returns

[`ToolCall`](../interfaces/ToolCall.md)\<`unknown`\>[]

***

### hasToolCalls()

```ts
hasToolCalls(): boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-calls.ts:195](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-calls.ts#L195)

Check if there are any complete tool calls to execute

#### Returns

`boolean`
