---
id: RealtimeTokenAdapter
title: RealtimeTokenAdapter
---

# Interface: RealtimeTokenAdapter

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Adapter interface for generating provider-specific tokens. Implemented by `openaiRealtimeToken()` and `elevenlabsRealtimeToken()`.

## Properties

### provider

```ts
provider: string;
```

Provider identifier (e.g., `'openai'`, `'elevenlabs'`).

## Methods

### generateToken()

```ts
generateToken(): Promise<RealtimeToken>;
```

Generate an ephemeral token for client use.

#### Returns

`Promise<`[`RealtimeToken`](./RealtimeToken.md)`>`
