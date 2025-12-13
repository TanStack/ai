---
id: ToolCallManager
title: ToolCallManager
---

# Class: ToolCallManager

Defined in: [tools/tool-calls.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L53)

Manages tool call accumulation and execution for the chat() method's automatic tool execution loop.

Responsibilities:
- Accumulates streaming tool call chunks (ID, name, arguments)
- Validates tool calls (filters out incomplete ones)
- Executes tool `execute` functions with parsed arguments
- Emits `tool_result` chunks for client visibility
- Returns tool result messages for conversation history

This class is used internally by the AI.chat() method to handle the automatic
tool execution loop. It can also be used independently for custom tool execution logic.

## Example

```typescript
const manager = new ToolCallManager(tools);

// During streaming, accumulate tool calls
for await (const chunk of stream) {
  if (chunk.type === "tool_call") {
    manager.addToolCallChunk(chunk);
  }
}

// After stream completes, execute tools
if (manager.hasToolCalls()) {
  const toolResults = yield* manager.executeTools(doneChunk);
  messages = [...messages, ...toolResults];
  manager.clear();
}
```

## Constructors

### Constructor

```ts
new ToolCallManager(tools): ToolCallManager;
```

Defined in: [tools/tool-calls.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L57)

#### Parameters

##### tools

readonly [`Tool`](../interfaces/Tool.md)\<`ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>, `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>, `string`\>[]

#### Returns

`ToolCallManager`

## Methods

### addToolCallArgsEvent()

```ts
addToolCallArgsEvent(chunk): void;
```

Defined in: [tools/tool-calls.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L79)

Add a TOOL_CALL_ARGS event to accumulate arguments

#### Parameters

##### chunk

[`ToolCallArgsEvent`](../interfaces/ToolCallArgsEvent.md)

#### Returns

`void`

***

### ~~addToolCallChunk()~~

```ts
addToolCallChunk(chunk): void;
```

Defined in: [tools/tool-calls.ts:106](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L106)

Add a tool call chunk to the accumulator (legacy format)
Handles streaming tool calls by accumulating arguments

#### Parameters

##### chunk

###### index

`number`

###### toolCall

\{
  `function`: \{
     `arguments`: `string`;
     `name`: `string`;
  \};
  `id`: `string`;
  `type`: `"function"`;
\}

###### toolCall.function

\{
  `arguments`: `string`;
  `name`: `string`;
\}

###### toolCall.function.arguments

`string`

###### toolCall.function.name

`string`

###### toolCall.id

`string`

###### toolCall.type

`"function"`

#### Returns

`void`

#### Deprecated

Use addToolCallStartEvent and addToolCallArgsEvent instead

***

### addToolCallStartEvent()

```ts
addToolCallStartEvent(chunk): void;
```

Defined in: [tools/tool-calls.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L64)

Add a TOOL_CALL_START event to begin tracking a tool call

#### Parameters

##### chunk

[`ToolCallStartEvent`](../interfaces/ToolCallStartEvent.md)

#### Returns

`void`

***

### clear()

```ts
clear(): void;
```

Defined in: [tools/tool-calls.ts:251](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L251)

Clear the tool calls map for the next iteration

#### Returns

`void`

***

### completeToolCall()

```ts
completeToolCall(toolCallId, input?): void;
```

Defined in: [tools/tool-calls.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L92)

Complete a tool call with its final input

#### Parameters

##### toolCallId

`string`

##### input?

`any`

#### Returns

`void`

***

### executeTools()

```ts
executeTools(doneChunk): AsyncGenerator<ToolCallEndEvent, ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
| null>[], void>;
```

Defined in: [tools/tool-calls.ts:164](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L164)

Execute all tool calls and return tool result messages
Also yields TOOL_CALL_END events for streaming

#### Parameters

##### doneChunk

[`RunFinishedEvent`](../interfaces/RunFinishedEvent.md)

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

Defined in: [tools/tool-calls.ts:154](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L154)

Get all complete tool calls (filtered for valid ID and name)

#### Returns

[`ToolCall`](../interfaces/ToolCall.md)[]

***

### hasToolCalls()

```ts
hasToolCalls(): boolean;
```

Defined in: [tools/tool-calls.ts:147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L147)

Check if there are any complete tool calls to execute

#### Returns

`boolean`
