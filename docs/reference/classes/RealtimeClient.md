---
id: RealtimeClient
title: RealtimeClient
---

# Class: RealtimeClient

Defined in: [realtime-client.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-client/src/realtime-client.ts)

Client for managing realtime voice conversations.

Handles connection lifecycle, audio I/O, message state, and tool execution for realtime voice-to-voice AI interactions. This is the framework-agnostic core that powers `useRealtimeChat` in React.

## Example

```typescript
import { RealtimeClient } from '@tanstack/ai-client'
import { openaiRealtime } from '@tanstack/ai-openai'

const client = new RealtimeClient({
  getToken: () => fetch('/api/realtime-token').then(r => r.json()),
  adapter: openaiRealtime(),
  tools: [myTool.client(handler)],
  onMessage: (msg) => console.log('Message:', msg),
})

await client.connect()
```

## Constructors

### Constructor

```ts
new RealtimeClient(options): RealtimeClient;
```

#### Parameters

##### options

[`RealtimeClientOptions`](../interfaces/RealtimeClientOptions.md)

Configuration options for the client.

#### Returns

`RealtimeClient`

## Properties

### status

```ts
readonly status: RealtimeStatus;
```

Current connection status (`'idle'`, `'connecting'`, `'connected'`, `'reconnecting'`, `'error'`).

***

### mode

```ts
readonly mode: RealtimeMode;
```

Current session mode (`'idle'`, `'listening'`, `'thinking'`, `'speaking'`).

***

### messages

```ts
readonly messages: Array<RealtimeMessage>;
```

Array of conversation messages. Updated as transcripts are finalized and messages complete.

***

### error

```ts
readonly error: Error | null;
```

Current error, if any.

***

### pendingUserTranscript

```ts
readonly pendingUserTranscript: string | null;
```

Partial transcript of what the user is currently saying (before finalization).

***

### pendingAssistantTranscript

```ts
readonly pendingAssistantTranscript: string | null;
```

Partial transcript of the assistant's current response (while speaking).

***

### audio

```ts
readonly audio: AudioVisualization | null;
```

Audio visualization data for the current connection. Returns `null` when not connected.

## Methods

### connect()

```ts
connect(): Promise<void>;
```

Connect to the realtime session. Fetches a token via `getToken()` and establishes the connection through the adapter.

#### Returns

`Promise<void>`

#### Throws

If token fetch or connection fails.

***

### disconnect()

```ts
disconnect(): Promise<void>;
```

Disconnect from the realtime session. Cleans up audio resources, event subscriptions, and token refresh timers.

#### Returns

`Promise<void>`

***

### startListening()

```ts
startListening(): void;
```

Start listening for voice input. Only needed when `vadMode` is `'manual'`.

#### Returns

`void`

***

### stopListening()

```ts
stopListening(): void;
```

Stop listening for voice input. Only needed when `vadMode` is `'manual'`.

#### Returns

`void`

***

### interrupt()

```ts
interrupt(): void;
```

Interrupt the current assistant response.

#### Returns

`void`

***

### sendText()

```ts
sendText(text): void;
```

Send a text message instead of voice.

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

MIME type of the image (e.g., `'image/png'`, `'image/jpeg'`).

#### Returns

`void`

***

### onStateChange()

```ts
onStateChange(callback): () => void;
```

Subscribe to state changes. The callback is invoked whenever the internal state updates (status, mode, messages, transcripts, errors).

#### Parameters

##### callback

[`RealtimeStateChangeCallback`](../type-aliases/RealtimeStateChangeCallback.md)

#### Returns

`() => void`

Unsubscribe function.

***

### destroy()

```ts
destroy(): void;
```

Clean up all resources. Disconnects, clears subscriptions, and releases audio resources. Call this when disposing of the client.

#### Returns

`void`
