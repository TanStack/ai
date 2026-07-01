---
id: RealtimeAdapter
title: RealtimeAdapter
---

# Interface: RealtimeAdapter

Defined in: [packages/ai/src/realtime/types.ts:312](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L312)

Adapter interface for connecting to realtime providers.
Each provider (OpenAI, ElevenLabs, etc.) implements this interface.

Defined here in `@tanstack/ai` — the shared layer that both provider adapter
packages and the client runtime (`@tanstack/ai-client`) already depend on —
so a provider package can describe its realtime adapter without taking a
dependency on the client-only `@tanstack/ai-client`. `@tanstack/ai-client`
re-exports this type for backwards compatibility.

## Properties

### connect()

```ts
connect: (token, clientTools?) => Promise<RealtimeConnection>;
```

Defined in: [packages/ai/src/realtime/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L322)

Create a connection using the provided token

#### Parameters

##### token

[`RealtimeToken`](RealtimeToken.md)

The ephemeral token from the server

##### clientTools?

readonly [`AnyClientTool`](../type-aliases/AnyClientTool.md)[]

Optional client-side tools to register with the provider

#### Returns

`Promise`\<[`RealtimeConnection`](RealtimeConnection.md)\>

A connection instance

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/realtime/types.ts:314](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L314)

Provider identifier
