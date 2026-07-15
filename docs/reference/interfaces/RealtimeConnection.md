---
id: RealtimeConnection
title: RealtimeConnection
---

# Interface: RealtimeConnection

Defined in: [packages/ai/src/realtime/types.ts:332](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L332)

Connection interface representing an active realtime session.
Handles audio I/O, events, and session management.

## Properties

### disconnect()

```ts
disconnect: () => Promise<void>;
```

Defined in: [packages/ai/src/realtime/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L335)

Disconnect from the realtime session

#### Returns

`Promise`\<`void`\>

***

### getAudioVisualization()

```ts
getAudioVisualization: () => AudioVisualization;
```

Defined in: [packages/ai/src/realtime/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L370)

Get audio visualization data

#### Returns

[`AudioVisualization`](AudioVisualization.md)

***

### interrupt()

```ts
interrupt: () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:359](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L359)

Interrupt the current response

#### Returns

`void`

***

### on()

```ts
on: <TEvent>(event, handler) => () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L363)

Subscribe to connection events

#### Type Parameters

##### TEvent

`TEvent` *extends* [`RealtimeEvent`](../type-aliases/RealtimeEvent.md)

#### Parameters

##### event

`TEvent`

##### handler

[`RealtimeEventHandler`](../type-aliases/RealtimeEventHandler.md)\<`TEvent`\>

#### Returns

```ts
(): void;
```

##### Returns

`void`

***

### sendImage()

```ts
sendImage: (imageData, mimeType) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:349](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L349)

Send an image to the conversation

#### Parameters

##### imageData

`string`

##### mimeType

`string`

#### Returns

`void`

***

### sendText()

```ts
sendText: (text) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:345](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L345)

Send a text message (fallback for when voice isn't available)

#### Parameters

##### text

`string`

#### Returns

`void`

***

### sendToolResult()

```ts
sendToolResult: (callId, result) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:353](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L353)

Send a tool execution result back to the provider

#### Parameters

##### callId

`string`

##### result

`string`

#### Returns

`void`

***

### startAudioCapture()

```ts
startAudioCapture: () => Promise<void>;
```

Defined in: [packages/ai/src/realtime/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L339)

Start capturing audio from the microphone

#### Returns

`Promise`\<`void`\>

***

### stopAudioCapture()

```ts
stopAudioCapture: () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L341)

Stop capturing audio

#### Returns

`void`

***

### updateSession()

```ts
updateSession: (config) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L357)

Update session configuration

#### Parameters

##### config

`Partial`\<[`RealtimeSessionConfig`](RealtimeSessionConfig.md)\>

#### Returns

`void`
