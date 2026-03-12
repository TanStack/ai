---
id: RealtimeConnection
title: RealtimeConnection
---

# Interface: RealtimeConnection

Defined in: [realtime-types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-client/src/realtime-types.ts)

Connection interface representing an active realtime session. Handles audio I/O, events, and session management. Returned by `RealtimeAdapter.connect()`.

## Methods

### disconnect()

```ts
disconnect(): Promise<void>;
```

Disconnect from the realtime session.

#### Returns

`Promise<void>`

***

### startAudioCapture()

```ts
startAudioCapture(): Promise<void>;
```

Start capturing audio from the microphone.

#### Returns

`Promise<void>`

***

### stopAudioCapture()

```ts
stopAudioCapture(): void;
```

Stop capturing audio.

#### Returns

`void`

***

### sendText()

```ts
sendText(text): void;
```

Send a text message (fallback for when voice isn't available).

#### Parameters

##### text

`string`

#### Returns

`void`

***

### sendImage()

```ts
sendImage(imageData, mimeType): void;
```

Send an image to the conversation.

#### Parameters

##### imageData

`string`

Base64-encoded image data or a URL.

##### mimeType

`string`

MIME type of the image.

#### Returns

`void`

***

### sendToolResult()

```ts
sendToolResult(callId, result): void;
```

Send a tool execution result back to the provider.

#### Parameters

##### callId

`string`

The tool call identifier.

##### result

`string`

JSON-serialized result.

#### Returns

`void`

***

### updateSession()

```ts
updateSession(config): void;
```

Update session configuration.

#### Parameters

##### config

`Partial<RealtimeSessionConfig>`

#### Returns

`void`

***

### interrupt()

```ts
interrupt(): void;
```

Interrupt the current response.

#### Returns

`void`

***

### on()

```ts
on<TEvent>(event, handler): () => void;
```

Subscribe to connection events.

#### Type Parameters

##### TEvent

`TEvent` *extends* `RealtimeEvent`

#### Parameters

##### event

`TEvent`

The event name (`'status_change'`, `'mode_change'`, `'transcript'`, `'audio_chunk'`, `'tool_call'`, `'message_complete'`, `'interrupted'`, `'error'`).

##### handler

`RealtimeEventHandler<TEvent>`

#### Returns

`() => void`

Unsubscribe function.

***

### getAudioVisualization()

```ts
getAudioVisualization(): AudioVisualization;
```

Get audio visualization data for rendering level meters or waveforms.

#### Returns

[`AudioVisualization`](./AudioVisualization.md)
