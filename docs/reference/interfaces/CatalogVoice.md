---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:3054](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3054)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:3062](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3062)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:3066](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3066)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:3058](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3058)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:3060](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3060)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:3064](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3064)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:3056](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3056)

Pass this to `generateSpeech()` as `voice`
