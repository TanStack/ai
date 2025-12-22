---
id: StreamProcessor
title: StreamProcessor
---

# Class: StreamProcessor

Defined in: [activities/chat/stream/processor.ts:168](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L168)

StreamProcessor - State machine for processing AI response streams

Manages the full UIMessage[] conversation and emits events on changes.

State tracking:
- Full message array
- Current assistant message being streamed
- Text content accumulation
- Multiple parallel tool calls
- Tool call completion detection

Tool call completion is detected when:
1. A new tool call starts at a different index
2. Text content arrives
3. Stream ends

## Constructors

### Constructor

```ts
new StreamProcessor(options): StreamProcessor;
```

Defined in: [activities/chat/stream/processor.ts:197](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L197)

#### Parameters

##### options

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md) = `{}`

#### Returns

`StreamProcessor`

## Methods

### addToolApprovalResponse()

```ts
addToolApprovalResponse(approvalId, approved): void;
```

Defined in: [activities/chat/stream/processor.ts:311](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L311)

Add an approval response (called by client after handling onApprovalRequest)

#### Parameters

##### approvalId

`string`

##### approved

`boolean`

#### Returns

`void`

***

### addToolResult()

```ts
addToolResult(
   toolCallId, 
   output, 
   error?): void;
```

Defined in: [activities/chat/stream/processor.ts:267](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L267)

Add a tool result (called by client after handling onToolCall)

#### Parameters

##### toolCallId

`string`

##### output

`any`

##### error?

`string`

#### Returns

`void`

***

### addUserMessage()

```ts
addUserMessage(content): UIMessage;
```

Defined in: [activities/chat/stream/processor.ts:225](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L225)

Add a user message to the conversation

#### Parameters

##### content

`string`

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)

***

### areAllToolsComplete()

```ts
areAllToolsComplete(): boolean;
```

Defined in: [activities/chat/stream/processor.ts:342](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L342)

Check if all tool calls in the last assistant message are complete
Useful for auto-continue logic

#### Returns

`boolean`

***

### clearMessages()

```ts
clearMessages(): void;
```

Defined in: [activities/chat/stream/processor.ts:374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L374)

Clear all messages

#### Returns

`void`

***

### finalizeStream()

```ts
finalizeStream(): void;
```

Defined in: [activities/chat/stream/processor.ts:948](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L948)

Finalize the stream - complete all pending operations

#### Returns

`void`

***

### getMessages()

```ts
getMessages(): UIMessage[];
```

Defined in: [activities/chat/stream/processor.ts:334](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L334)

Get current messages

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)[]

***

### getRecording()

```ts
getRecording(): ChunkRecording | null;
```

Defined in: [activities/chat/stream/processor.ts:1034](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1034)

Get the current recording

#### Returns

[`ChunkRecording`](../interfaces/ChunkRecording.md) \| `null`

***

### getState()

```ts
getState(): ProcessorState;
```

Defined in: [activities/chat/stream/processor.ts:1007](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1007)

Get current processor state (legacy)

#### Returns

[`ProcessorState`](../interfaces/ProcessorState.md)

***

### process()

```ts
process(stream): Promise<ProcessorResult>;
```

Defined in: [activities/chat/stream/processor.ts:387](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L387)

Process a stream and emit events through handlers

#### Parameters

##### stream

`AsyncIterable`\<`any`\>

#### Returns

`Promise`\<[`ProcessorResult`](../interfaces/ProcessorResult.md)\>

***

### processChunk()

```ts
processChunk(chunk): void;
```

Defined in: [activities/chat/stream/processor.ts:415](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L415)

Process a single chunk from the stream

#### Parameters

##### chunk

[`StreamChunk`](../type-aliases/StreamChunk.md)

#### Returns

`void`

***

### removeMessagesAfter()

```ts
removeMessagesAfter(index): void;
```

Defined in: [activities/chat/stream/processor.ts:366](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L366)

Remove messages after a certain index (for reload/retry)

#### Parameters

##### index

`number`

#### Returns

`void`

***

### reset()

```ts
reset(): void;
```

Defined in: [activities/chat/stream/processor.ts:1057](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1057)

Full reset (including messages)

#### Returns

`void`

***

### setMessages()

```ts
setMessages(messages): void;
```

Defined in: [activities/chat/stream/processor.ts:217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L217)

Set the messages array (e.g., from persisted state)

#### Parameters

##### messages

[`UIMessage`](../interfaces/UIMessage.md)[]

#### Returns

`void`

***

### startAssistantMessage()

```ts
startAssistantMessage(): string;
```

Defined in: [activities/chat/stream/processor.ts:243](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L243)

Start streaming a new assistant message
Returns the message ID

#### Returns

`string`

***

### startRecording()

```ts
startRecording(): void;
```

Defined in: [activities/chat/stream/processor.ts:1021](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1021)

Start recording chunks

#### Returns

`void`

***

### toModelMessages()

```ts
toModelMessages(): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [activities/chat/stream/processor.ts:323](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L323)

Get the conversation as ModelMessages (for sending to LLM)

#### Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

***

### replay()

```ts
static replay(recording, options?): Promise<ProcessorResult>;
```

Defined in: [activities/chat/stream/processor.ts:1066](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1066)

Replay a recording through the processor

#### Parameters

##### recording

[`ChunkRecording`](../interfaces/ChunkRecording.md)

##### options?

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md)

#### Returns

`Promise`\<[`ProcessorResult`](../interfaces/ProcessorResult.md)\>
