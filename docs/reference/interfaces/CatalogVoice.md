---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:3037](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3037)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:3045](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3045)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:3049](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3049)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:3041](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3041)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:3043](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3043)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:3047](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3047)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:3039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3039)

Pass this to `generateSpeech()` as `voice`
