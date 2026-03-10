---
id: RealtimeClientOptions
title: RealtimeClientOptions
---

# Interface: RealtimeClientOptions

Defined in: [realtime-types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-client/src/realtime-types.ts)

Options for the `RealtimeClient` and `useRealtimeChat` hook.

## Properties

### getToken

```ts
getToken: () => Promise<RealtimeToken>;
```

Function to fetch a realtime token from the server. Called on connect and when the token needs refresh.

***

### adapter

```ts
adapter: RealtimeAdapter;
```

The realtime adapter to use (e.g., `openaiRealtime()`, `elevenlabsRealtime()`).

***

### tools?

```ts
optional tools: ReadonlyArray<AnyClientTool>;
```

Client-side tools with execution logic.

***

### autoPlayback?

```ts
optional autoPlayback: boolean;
```

Auto-play assistant audio responses. Default: `true`.

***

### autoCapture?

```ts
optional autoCapture: boolean;
```

Request microphone access on connect. Default: `true`.

***

### instructions?

```ts
optional instructions: string;
```

System instructions for the assistant.

***

### voice?

```ts
optional voice: string;
```

Voice to use for audio output (provider-specific, e.g., `'alloy'` for OpenAI).

***

### vadMode?

```ts
optional vadMode: 'server' | 'semantic' | 'manual';
```

Voice activity detection mode. Default: `'server'`.

- `'server'` — Provider handles speech detection server-side
- `'semantic'` — Semantic turn detection (OpenAI only)
- `'manual'` — Application controls via `startListening()`/`stopListening()`

***

### outputModalities?

```ts
optional outputModalities: Array<'audio' | 'text'>;
```

Output modalities for responses.

***

### temperature?

```ts
optional temperature: number;
```

Temperature for generation (provider-specific range).

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | 'inf';
```

Maximum number of tokens in a response.

***

### semanticEagerness?

```ts
optional semanticEagerness: 'low' | 'medium' | 'high';
```

Eagerness level for semantic VAD.

***

### onStatusChange?

```ts
optional onStatusChange: (status: RealtimeStatus) => void;
```

Called when connection status changes.

***

### onModeChange?

```ts
optional onModeChange: (mode: RealtimeMode) => void;
```

Called when session mode changes.

***

### onMessage?

```ts
optional onMessage: (message: RealtimeMessage) => void;
```

Called when a new message is added to the conversation.

***

### onError?

```ts
optional onError: (error: Error) => void;
```

Called when an error occurs.

***

### onConnect?

```ts
optional onConnect: () => void;
```

Called when connection is established.

***

### onDisconnect?

```ts
optional onDisconnect: () => void;
```

Called when disconnected.

***

### onInterrupted?

```ts
optional onInterrupted: () => void;
```

Called when the assistant's response is interrupted.
