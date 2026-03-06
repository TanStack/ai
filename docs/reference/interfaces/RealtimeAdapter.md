---
id: RealtimeAdapter
title: RealtimeAdapter
---

# Interface: RealtimeAdapter

Defined in: [realtime-types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-client/src/realtime-types.ts)

Adapter interface for connecting to realtime providers. Each provider (OpenAI, ElevenLabs, etc.) implements this interface.

## Properties

### provider

```ts
provider: string;
```

Provider identifier (e.g., `'openai'`, `'elevenlabs'`).

## Methods

### connect()

```ts
connect(token, clientTools?): Promise<RealtimeConnection>;
```

Create a connection using the provided token.

#### Parameters

##### token

[`RealtimeToken`](./RealtimeToken.md)

The ephemeral token from the server.

##### clientTools?

`ReadonlyArray<AnyClientTool>`

Optional client-side tools to register with the provider.

#### Returns

`Promise<`[`RealtimeConnection`](./RealtimeConnection.md)`>`
