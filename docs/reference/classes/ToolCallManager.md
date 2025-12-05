---
id: ToolCallManager
title: ToolCallManager
---

# Class: ToolCallManager

Defined in: [tools/tool-calls.ts:41](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L41)

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

Defined in: [tools/tool-calls.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L45)

#### Parameters

##### tools

readonly [`Tool`](../interfaces/Tool.md)\<`ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>, `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>, `string`\>[]

#### Returns

`ToolCallManager`

## Methods

### addToolCallChunk()

```ts
addToolCallChunk(chunk): void;
```

Defined in: [tools/tool-calls.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L53)

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

Defined in: [tools/tool-calls.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L193)

Clear the tool calls map for the next iteration

#### Returns

`void`

***

### executeTools()

```ts
executeTools(doneChunk): AsyncGenerator<ToolResultStreamChunk, ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
| null>[], void>;
```

Defined in: [tools/tool-calls.ts:111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L111)

Execute all tool calls and return tool result messages
Also yields tool_result chunks for streaming

#### Parameters

##### doneChunk

[`DoneStreamChunk`](../interfaces/DoneStreamChunk.md)

#### Returns

`AsyncGenerator`\<[`ToolResultStreamChunk`](../interfaces/ToolResultStreamChunk.md), [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[], `void`\>

***

### getToolCalls()

```ts
getToolCalls(): ToolCall[];
```

Defined in: [tools/tool-calls.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L101)

Get all complete tool calls (filtered for valid ID and name)

#### Returns

[`ToolCall`](../interfaces/ToolCall.md)[]

***

### hasToolCalls()

```ts
hasToolCalls(): boolean;
```

Defined in: [tools/tool-calls.ts:94](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-calls.ts#L94)

Check if there are any complete tool calls to execute

#### Returns

`boolean`
