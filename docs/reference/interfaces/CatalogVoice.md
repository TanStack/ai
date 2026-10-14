---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:3012](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3012)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:3020](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3020)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:3024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3024)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:3016](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3016)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:3018](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3018)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:3022](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3022)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:3014](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3014)

Pass this to `generateSpeech()` as `voice`
