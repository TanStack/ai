---
id: ListVoicesOptions
title: ListVoicesOptions
---

Defined in: [packages/ai/src/types.ts:2534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2534)

Options for listing a provider's voices.

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2544)

Effective abort signal. Adapters forward this to the provider SDK when
supported.

***

### origins?

```ts
optional origins?: VoiceOrigin[];
```

Defined in: [packages/ai/src/types.ts:2539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2539)

Restrict the result to voices of these origins. Adapters filter server
side when the provider supports it, and in memory otherwise.
