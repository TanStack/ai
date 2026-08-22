---
id: StreamProcessor
title: StreamProcessor
---

# Class: StreamProcessor

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:175](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L175)

StreamProcessor - State machine for processing AI response streams

Manages the full UIMessage[] conversation and emits events on changes.
Trusts the adapter contract: adapters emit clean AG-UI events in the
correct order.

State tracking:
- Full message array
- Per-message stream state (text, tool calls, thinking)
- Multiple concurrent message streams
- Tool call completion via TOOL_CALL_END events

## See

 - docs/chat-architecture.md#streamprocessor-internal-state — State field reference
 - docs/chat-architecture.md#adapter-contract — What this class expects from adapters

## Constructors

### Constructor

```ts
new StreamProcessor(options?): StreamProcessor;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L212)

#### Parameters

##### options?

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md) = `{}`

#### Returns

`StreamProcessor`

## Methods

### addToolApprovalResponse()

```ts
addToolApprovalResponse(approvalId, approved): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L370)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L326)

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
addUserMessage(content, id?): UIMessage;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:259](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L259)

Add a user message to the conversation.
Supports both simple string content and multimodal content arrays.

#### Parameters

##### content

`string` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

The message content (string or array of content parts)

##### id?

`string`

Optional custom message ID (generated if not provided)

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)

The created UIMessage

#### Example

```ts
// Simple text message
processor.addUserMessage('Hello!')

// Multimodal message with image
processor.addUserMessage([
  { type: 'text', content: 'What is in this image?' },
  { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } }
])

// With custom ID
processor.addUserMessage('Hello!', 'custom-id-123')
```

***

### areAllToolsComplete()

```ts
areAllToolsComplete(): boolean;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:401](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L401)

Check if all tool calls in the last assistant message are complete
Useful for auto-continue logic

#### Returns

`boolean`

***

### clearMessages()

```ts
clearMessages(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:473](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L473)

Clear all messages

#### Returns

`void`

***

### finalizeStream()

```ts
finalizeStream(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2266](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2266)

Finalize the stream — complete all pending operations.

Called when the async iterable ends (stream closed). Acts as the final
safety net: completes any remaining tool calls, flushes un-emitted text,
and fires onStreamEnd.

#### Returns

`void`

#### See

docs/chat-architecture.md#single-shot-text-response — Finalization step

***

### getCurrentAssistantMessageId()

```ts
getCurrentAssistantMessageId(): string | null;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:310](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L310)

Get the current assistant message ID (if one has been created).
Returns null if prepareAssistantMessage() was called but no content
has arrived yet.

#### Returns

`string` \| `null`

***

### getMessages()

```ts
getMessages(): UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L393)

Get current messages

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

***

### getRecording()

```ts
getRecording(): ChunkRecording | null;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2430](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2430)

Get the current recording

#### Returns

[`ChunkRecording`](../interfaces/ChunkRecording.md) \| `null`

***

### getState()

```ts
getState(): ProcessorState;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2387](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2387)

Get current processor state (aggregated across all messages)

#### Returns

[`ProcessorState`](../interfaces/ProcessorState.md)

***

### prepareAssistantMessage()

```ts
prepareAssistantMessage(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:289](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L289)

Prepare for a new assistant message stream.
Does NOT create the message immediately -- the message is created lazily
when the first content-bearing chunk arrives via ensureAssistantMessage().
This prevents empty assistant messages from flickering in the UI when
auto-continuation produces no content.

#### Returns

`void`

***

### process()

```ts
process(stream): Promise<ProcessorResult>;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:491](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L491)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:525](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L525)

Process a single chunk from the stream.

Central dispatch for all AG-UI events. Each event type maps to a specific
handler. Events not listed in the switch are intentionally ignored
(STEP_STARTED, STATE_SNAPSHOT, STATE_DELTA).

#### Parameters

##### chunk

[`AGUIEvent`](../type-aliases/AGUIEvent.md)

#### Returns

`void`

#### See

docs/chat-architecture.md#adapter-contract — Expected event types and ordering

***

### removeMessagesAfter()

```ts
removeMessagesAfter(index): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L441)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2455](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2455)

Full reset (including messages)

#### Returns

`void`

***

### setMessages()

```ts
setMessages(messages): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L231)

Set the messages array (e.g., from persisted state)

#### Parameters

##### messages

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

#### Returns

`void`

***

### ~~startAssistantMessage()~~

```ts
startAssistantMessage(messageId?): string;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L298)

#### Parameters

##### messageId?

`string`

#### Returns

`string`

#### Deprecated

Use prepareAssistantMessage() instead. This eagerly creates
an assistant message which can cause empty message flicker.

***

### startRecording()

```ts
startRecording(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2417](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2417)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:382](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L382)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2474](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2474)

Replay a recording through the processor

#### Parameters

##### recording

[`ChunkRecording`](../interfaces/ChunkRecording.md)

##### options?

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md)

#### Returns

`Promise`\<[`ProcessorResult`](../interfaces/ProcessorResult.md)\>
