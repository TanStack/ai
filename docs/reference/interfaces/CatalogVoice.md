---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:2578](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2578)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2586](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2586)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:2590](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2590)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2582)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:2584](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2584)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2588](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2588)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2580](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2580)

Pass this to `generateSpeech()` as `voice`
