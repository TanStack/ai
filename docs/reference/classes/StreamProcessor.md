---
id: StreamProcessor
title: StreamProcessor
---

# Class: StreamProcessor

Defined in: [stream/processor.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L171)

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

Defined in: [stream/processor.ts:200](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L200)

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

Defined in: [stream/processor.ts:314](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L314)

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

Defined in: [stream/processor.ts:270](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L270)

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

Defined in: [stream/processor.ts:228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L228)

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

Defined in: [stream/processor.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L345)

Check if all tool calls in the last assistant message are complete
Useful for auto-continue logic

#### Returns

`boolean`

***

### clearMessages()

```ts
clearMessages(): void;
```

Defined in: [stream/processor.ts:377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L377)

Clear all messages

#### Returns

`void`

***

### finalizeStream()

```ts
finalizeStream(): void;
```

Defined in: [stream/processor.ts:951](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L951)

Finalize the stream - complete all pending operations

#### Returns

`void`

***

### getMessages()

```ts
getMessages(): UIMessage[];
```

Defined in: [stream/processor.ts:337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L337)

Get current messages

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)[]

***

### getRecording()

```ts
getRecording(): ChunkRecording | null;
```

Defined in: [stream/processor.ts:1037](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L1037)

Get the current recording

#### Returns

[`ChunkRecording`](../interfaces/ChunkRecording.md) \| `null`

***

### getState()

```ts
getState(): ProcessorState;
```

Defined in: [stream/processor.ts:1010](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L1010)

Get current processor state (legacy)

#### Returns

[`ProcessorState`](../interfaces/ProcessorState.md)

***

### process()

```ts
process(stream): Promise<ProcessorResult>;
```

Defined in: [stream/processor.ts:390](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L390)

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

Defined in: [stream/processor.ts:418](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L418)

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

Defined in: [stream/processor.ts:369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L369)

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

Defined in: [stream/processor.ts:1060](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L1060)

Full reset (including messages)

#### Returns

`void`

***

### setMessages()

```ts
setMessages(messages): void;
```

Defined in: [stream/processor.ts:220](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L220)

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

Defined in: [stream/processor.ts:246](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L246)

Start streaming a new assistant message
Returns the message ID

#### Returns

`string`

***

### startRecording()

```ts
startRecording(): void;
```

Defined in: [stream/processor.ts:1024](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L1024)

Start recording chunks

#### Returns

`void`

***

### toModelMessages()

```ts
toModelMessages(): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [stream/processor.ts:326](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L326)

Get the conversation as ModelMessages (for sending to LLM)

#### Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

***

### replay()

```ts
static replay(recording, options?): Promise<ProcessorResult>;
```

Defined in: [stream/processor.ts:1069](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L1069)

Replay a recording through the processor

#### Parameters

##### recording

[`ChunkRecording`](../interfaces/ChunkRecording.md)

##### options?

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md)

#### Returns

`Promise`\<[`ProcessorResult`](../interfaces/ProcessorResult.md)\>
