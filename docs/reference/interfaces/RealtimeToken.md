---
id: RealtimeToken
title: RealtimeToken
---

Defined in: packages/ai/src/realtime/types.ts:63

Token returned by the server for client authentication

## Properties

### config

```ts
config: RealtimeSessionConfig;
```

Defined in: packages/ai/src/realtime/types.ts:71

Session configuration embedded in the token

***

### expiresAt

```ts
expiresAt: number;
```

Defined in: packages/ai/src/realtime/types.ts:69

Token expiration timestamp (ms since epoch)

***

### provider

```ts
provider: string;
```

Defined in: packages/ai/src/realtime/types.ts:65

Provider identifier

***

### token

```ts
token: string;
```

Defined in: packages/ai/src/realtime/types.ts:67

The ephemeral token value
