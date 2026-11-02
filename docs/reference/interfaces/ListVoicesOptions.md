---
id: ListVoicesOptions
title: ListVoicesOptions
---

Defined in: [packages/ai/src/types.ts:3035](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3035)

Options for listing a provider's voices.

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:3045](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3045)

Effective abort signal. Adapters forward this to the provider SDK when
supported.

***

### origins?

```ts
optional origins?: VoiceOrigin[];
```

Defined in: [packages/ai/src/types.ts:3040](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3040)

Restrict the result to voices of these origins. Adapters filter server
side when the provider supports it, and in memory otherwise.
