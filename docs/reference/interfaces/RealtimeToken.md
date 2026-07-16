---
id: RealtimeToken
title: RealtimeToken
---

# Interface: RealtimeToken

Defined in: [packages/ai/src/realtime/types.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L63)

Token returned by the server for client authentication

## Properties

### config

```ts
config: RealtimeSessionConfig;
```

Defined in: [packages/ai/src/realtime/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L71)

Session configuration embedded in the token

***

### expiresAt

```ts
expiresAt: number;
```

Defined in: [packages/ai/src/realtime/types.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L69)

Token expiration timestamp (ms since epoch)

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/realtime/types.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L65)

Provider identifier

***

### token

```ts
token: string;
```

Defined in: [packages/ai/src/realtime/types.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L67)

The ephemeral token value
