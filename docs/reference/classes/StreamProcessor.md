---
id: StreamProcessor
title: StreamProcessor
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L200)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:244](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L244)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L447)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:396](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L396)

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
addUserMessage(
   content, 
   id?, 
   metadata?): UIMessage;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L324)

Add a user message to the conversation.
Supports both simple string content and multimodal content arrays.

#### Parameters

##### content

`string` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

The message content (string or array of content parts)

##### id?

`string`

Optional custom message ID (generated if not provided)

##### metadata?

`Record`\<`string`, `any`\>

Optional AG-UI metadata bag

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:487](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L487)

Check if all tool calls in the last assistant message are complete
Useful for auto-continue logic

#### Returns

`boolean`

***

### clearMessages()

```ts
clearMessages(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:559](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L559)

Clear all messages

#### Returns

`void`

***

### finalizeStream()

```ts
finalizeStream(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2845](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2845)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L380)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:479](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L479)

Get current messages

#### Returns

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

***

### getRecording()

```ts
getRecording(): ChunkRecording | null;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:3011](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L3011)

Get the current recording

#### Returns

[`ChunkRecording`](../interfaces/ChunkRecording.md) \| `null`

***

### getState()

```ts
getState(): ProcessorState;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2968](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2968)

Get current processor state (aggregated across all messages)

#### Returns

[`ProcessorState`](../interfaces/ProcessorState.md)

***

### prepareAssistantMessage()

```ts
prepareAssistantMessage(): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:359](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L359)

Prepare for a new assistant message stream.
Does NOT create the message immediately -- the message is created lazily
when the first content-bearing chunk arrives via ensureAssistantMessage().
This prevents empty assistant messages from flickering in the UI when
auto-continuation produces no content.

#### Returns

`void`

***

### prependMessages()

```ts
prependMessages(messages): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L285)

Put older UI messages at the front of the conversation.

Skip a message if its id is already in the list. Keep the existing message.
Then emit the same messages-change event as `setMessages`.

Use this for older history pages. The first hydrate window uses `setMessages`.

#### Parameters

##### messages

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

Older UI messages in insertion order. The first item is the oldest.

#### Returns

`void`

#### Example

```ts
processor.setMessages([newest])
processor.prependMessages([oldest])
```

***

### process()

```ts
process(stream): Promise<ProcessorResult>;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:579](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L579)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:613](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L613)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:527](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L527)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:3037](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L3037)

Full reset (including messages)

#### Returns

`void`

***

### setMessages()

```ts
setMessages(messages): void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L264)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:368](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L368)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:2998](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L2998)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:468](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L468)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:3058](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L3058)

Replay a recording through the processor

#### Parameters

##### recording

[`ChunkRecording`](../interfaces/ChunkRecording.md)

##### options?

[`StreamProcessorOptions`](../interfaces/StreamProcessorOptions.md)

#### Returns

`Promise`\<[`ProcessorResult`](../interfaces/ProcessorResult.md)\>
