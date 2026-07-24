---
id: RealtimeTokenAdapter
title: RealtimeTokenAdapter
---

# Interface: RealtimeTokenAdapter

Defined in: [packages/ai/src/realtime/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L77)

Adapter interface for generating provider-specific tokens

## Properties

### generateToken()

```ts
generateToken: () => Promise<RealtimeToken>;
```

Defined in: [packages/ai/src/realtime/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L81)

Generate an ephemeral token for client use

#### Returns

`Promise`\<[`RealtimeToken`](RealtimeToken.md)\>

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/realtime/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L79)

Provider identifier
