---
id: ListVoicesOptions
title: ListVoicesOptions
---

Defined in: [packages/ai/src/types.ts:2812](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2812)

Options for listing a provider's voices.

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2822](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2822)

Effective abort signal. Adapters forward this to the provider SDK when
supported.

***

### origins?

```ts
optional origins?: VoiceOrigin[];
```

Defined in: [packages/ai/src/types.ts:2817](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2817)

Restrict the result to voices of these origins. Adapters filter server
side when the provider supports it, and in memory otherwise.
