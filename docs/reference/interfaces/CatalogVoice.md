---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:2518](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2518)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2526)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:2530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2530)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2522](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2522)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:2524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2524)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2528)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2520)

Pass this to `generateSpeech()` as `voice`
