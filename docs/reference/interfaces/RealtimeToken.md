---
id: RealtimeToken
title: RealtimeToken
---

# Interface: RealtimeToken

Defined in: [packages/typescript/ai/src/realtime/types.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L58)

Token returned by the server for client authentication

## Properties

### config

```ts
config: RealtimeSessionConfig;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L66)

Session configuration embedded in the token

***

### expiresAt

```ts
expiresAt: number;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L64)

Token expiration timestamp (ms since epoch)

***

### provider

```ts
provider: string;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L60)

Provider identifier

***

### token

```ts
token: string;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L62)

The ephemeral token value
