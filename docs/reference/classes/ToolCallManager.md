---
id: ToolCallManager
title: ToolCallManager
---

# Class: ToolCallManager

Defined in: [activities/chat/tools/tool-calls.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L42)

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

Defined in: [activities/chat/tools/tool-calls.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L46)

#### Parameters

##### tools

readonly [`Tool`](../interfaces/Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>[]

#### Returns

`ToolCallManager`

## Methods

### addToolCallChunk()

```ts
addToolCallChunk(chunk): void;
```

Defined in: [activities/chat/tools/tool-calls.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L54)

Add a tool call chunk to the accumulator
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

***

### clear()

```ts
clear(): void;
```

Defined in: [activities/chat/tools/tool-calls.ts:209](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L209)

Clear the tool calls map for the next iteration

#### Returns

`void`

***

### executeTools()

```ts
executeTools(doneChunk): AsyncGenerator<ToolResultStreamChunk, ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
| null>[], void>;
```

Defined in: [activities/chat/tools/tool-calls.ts:112](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L112)

Execute all tool calls and return tool result messages
Also yields tool_result chunks for streaming

#### Parameters

##### doneChunk

[`DoneStreamChunk`](../interfaces/DoneStreamChunk.md)

#### Returns

`AsyncGenerator`\<[`ToolResultStreamChunk`](../interfaces/ToolResultStreamChunk.md), [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[], `void`\>

***

### getToolCalls()

```ts
getToolCalls(): ToolCall[];
```

Defined in: [activities/chat/tools/tool-calls.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L102)

Get all complete tool calls (filtered for valid ID and name)

#### Returns

[`ToolCall`](../interfaces/ToolCall.md)[]

***

### hasToolCalls()

```ts
hasToolCalls(): boolean;
```

Defined in: [activities/chat/tools/tool-calls.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-calls.ts#L95)

Check if there are any complete tool calls to execute

#### Returns

`boolean`
