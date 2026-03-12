---
id: RealtimeToken
title: RealtimeToken
---

# Interface: RealtimeToken

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Token returned by the server for client authentication. Contains the ephemeral credentials, expiration time, and session configuration for a realtime connection.

## Properties

### provider

```ts
provider: string;
```

Provider identifier (e.g., `'openai'`, `'elevenlabs'`).

***

### token

```ts
token: string;
```

The ephemeral token value. For OpenAI, this is a client secret. For ElevenLabs, this is a signed URL.

***

### expiresAt

```ts
expiresAt: number;
```

Token expiration timestamp in milliseconds since epoch.

***

### config

```ts
config: RealtimeSessionConfig;
```

Session configuration embedded in the token (model, voice, instructions, etc.).
