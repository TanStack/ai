---
id: RealtimeConnection
title: RealtimeConnection
---

Defined in: [packages/ai/src/realtime/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L351)

Connection interface representing an active realtime session.
Handles audio I/O, events, and session management.

## Properties

### disconnect

```ts
disconnect: () => Promise<void>;
```

Defined in: [packages/ai/src/realtime/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L354)

Disconnect from the realtime session

#### Returns

`Promise`\<`void`\>

***

### getAudioVisualization

```ts
getAudioVisualization: () => AudioVisualization;
```

Defined in: [packages/ai/src/realtime/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L391)

Get audio visualization data

#### Returns

[`AudioVisualization`](AudioVisualization.md)

***

### interrupt

```ts
interrupt: () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L380)

Interrupt the current response

#### Returns

`void`

***

### on

```ts
on: <TEvent>(event, handler) => () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:384](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L384)

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

() => `void`

***

### sendImage

```ts
sendImage: (imageData, mimeType) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:368](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L368)

Send an image to the conversation

#### Parameters

##### imageData

`string`

##### mimeType

`string`

#### Returns

`void`

***

### sendText

```ts
sendText: (text) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L364)

Send a text message (fallback for when voice isn't available)

#### Parameters

##### text

`string`

#### Returns

`void`

***

### sendToolResult

```ts
sendToolResult: (callId, result) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L372)

Send a tool execution result back to the provider

#### Parameters

##### callId

`string`

##### result

`string`

#### Returns

`void`

***

### startAudioCapture

```ts
startAudioCapture: () => Promise<void>;
```

Defined in: [packages/ai/src/realtime/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L358)

Start capturing audio from the microphone

#### Returns

`Promise`\<`void`\>

***

### stopAudioCapture

```ts
stopAudioCapture: () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L360)

Stop capturing audio

#### Returns

`void`

***

### updateSession

```ts
updateSession: (config) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:376](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L376)

Update session configuration

#### Parameters

##### config

`Partial`\<[`RealtimeSessionConfig`](RealtimeSessionConfig.md)\>

#### Returns

`void`

***

### updateToken?

```ts
optional updateToken?: (token) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:378](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L378)

Update the ephemeral token (e.g. on refresh); provider may reconnect

#### Parameters

##### token

[`RealtimeToken`](RealtimeToken.md)

#### Returns

`void`
