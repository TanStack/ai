---
id: ListVoicesOptions
title: ListVoicesOptions
---

Defined in: [packages/ai/src/types.ts:3028](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3028)

Options for listing a provider's voices.

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:3038](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3038)

Effective abort signal. Adapters forward this to the provider SDK when
supported.

***

### origins?

```ts
optional origins?: VoiceOrigin[];
```

Defined in: [packages/ai/src/types.ts:3033](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3033)

Restrict the result to voices of these origins. Adapters filter server
side when the provider supports it, and in memory otherwise.
