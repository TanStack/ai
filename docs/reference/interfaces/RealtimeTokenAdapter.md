---
id: RealtimeTokenAdapter
title: RealtimeTokenAdapter
---

Defined in: [packages/ai/src/realtime/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L77)

Adapter interface for generating provider-specific tokens

## Properties

### generateToken

```ts
generateToken: (options?) => Promise<RealtimeToken>;
```

Defined in: [packages/ai/src/realtime/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L84)

Generate an ephemeral token for client use. Adapters should forward
`options.abortSignal` to the provider request when supported.

#### Parameters

##### options?

###### abortSignal?

`AbortSignal`

#### Returns

`Promise`\<[`RealtimeToken`](RealtimeToken.md)\>

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/realtime/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L79)

Provider identifier
