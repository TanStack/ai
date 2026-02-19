---
id: StreamProcessor
title: StreamProcessor
---

# Class: StreamProcessor

Defined in: [activities/chat/stream/processor.ts:120](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L120)

StreamProcessor - State machine for processing AI response streams

Manages the full UIMessage[] conversation and emits events on changes.
Trusts the adapter contract: adapters emit clean AG-UI events in the
correct order.

State tracking:
- Full message array
- Current assistant message being streamed
- Text content accumulation (reset on TEXT_MESSAGE_START)
- Multiple parallel tool calls
- Tool call completion via TOOL_CALL_END events

## See

 - docs/chat-architecture.md#streamprocessor-internal-state — State field reference
 - docs/chat-architecture.md#adapter-contract — What this class expects from adapters

## Constructors

### Constructor

```ts
new StreamProcessor(options): StreamProcessor;
```

Defined in: [activities/chat/stream/processor.ts:147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L147)

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

Defined in: [activities/chat/stream/processor.ts:329](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L329)

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

Defined in: [activities/chat/stream/processor.ts:285](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L285)

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

Defined in: [activities/chat/stream/processor.ts:194](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L194)

Add a user message to the conversation.
Supports both simple string content and multimodal content arrays.

#### Parameters

##### content

The message content (string or array of content parts)

`string` | [`ContentPart`](../type-aliases/ContentPart.md)[]

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

Defined in: [activities/chat/stream/processor.ts:360](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L360)

Check if all tool calls in the last assistant message are complete
Useful for auto-continue logic

#### Returns

`boolean`

***

### clearMessages()

```ts
clearMessages(): void;
```

Defined in: [activities/chat/stream/processor.ts:404](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L404)

Clear all messages

#### Returns

`void`

***

### finalizeStream()

```ts
finalizeStream(): void;
```

Defined in: [activities/chat/stream/processor.ts:954](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L954)

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

Defined in: [activities/chat/stream/processor.ts:246](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L246)

Get the current assistant message ID (if one has been created).
Returns null if prepareAssistantMessage() was called but no content
has arrived yet.

#### Returns

`string` \| `null`

***

### getMessages()

```ts
getMessages(): UIMessage[];
```

Defined in: [activities/chat/stream/processor.ts:352](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L352)

Get current messages

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)[]

***

### getRecording()

```ts
getRecording(): ChunkRecording | null;
```

Defined in: [activities/chat/stream/processor.ts:1051](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1051)

Get the current recording

#### Returns

[`ChunkRecording`](../interfaces/ChunkRecording.md) \| `null`

***

### getState()

```ts
getState(): ProcessorState;
```

Defined in: [activities/chat/stream/processor.ts:1024](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1024)

Get current processor state

#### Returns

[`ProcessorState`](../interfaces/ProcessorState.md)

***

### prepareAssistantMessage()

```ts
prepareAssistantMessage(): void;
```

Defined in: [activities/chat/stream/processor.ts:224](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L224)

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

Defined in: [activities/chat/stream/processor.ts:417](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L417)

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

Defined in: [activities/chat/stream/processor.ts:451](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L451)

Process a single chunk from the stream.

Central dispatch for all AG-UI events. Each event type maps to a specific
handler. Events not listed in the switch are intentionally ignored
(RUN_STARTED, TEXT_MESSAGE_END, STEP_STARTED, STATE_SNAPSHOT, STATE_DELTA).

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

Defined in: [activities/chat/stream/processor.ts:396](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L396)

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

Defined in: [activities/chat/stream/processor.ts:1074](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1074)

Full reset (including messages)

#### Returns

`void`

***

### setMessages()

```ts
setMessages(messages): void;
```

Defined in: [activities/chat/stream/processor.ts:166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L166)

Set the messages array (e.g., from persisted state)

#### Parameters

##### messages

[`UIMessage`](../interfaces/UIMessage.md)[]

#### Returns

`void`

***

### ~~startAssistantMessage()~~

```ts
startAssistantMessage(): string;
```

Defined in: [activities/chat/stream/processor.ts:236](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L236)

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

Defined in: [activities/chat/stream/processor.ts:1038](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1038)

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

Defined in: [activities/chat/stream/processor.ts:341](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L341)

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

Defined in: [activities/chat/stream/processor.ts:1094](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1094)

Replay a recording through the processor

#### Parameters

##### recording

[`ChunkRecording`](../interfaces/ChunkRecording.md)

##### options?

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md)

#### Returns

`Promise`\<[`ProcessorResult`](../interfaces/ProcessorResult.md)\>
