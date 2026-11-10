---
id: RealtimeTokenOptions
title: RealtimeTokenOptions
---

Defined in: [packages/ai/src/realtime/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L92)

Options for the realtimeToken function

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/realtime/types.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L98)

Cancels the token request. The call rejects when the signal aborts.

***

### adapter

```ts
adapter: RealtimeTokenAdapter;
```

Defined in: [packages/ai/src/realtime/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L94)

The token adapter to use
