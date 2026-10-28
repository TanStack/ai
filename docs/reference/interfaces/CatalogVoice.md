---
id: CatalogVoice
title: CatalogVoice
---

Defined in: packages/ai/src/types.ts:2971

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: packages/ai/src/types.ts:2979

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: packages/ai/src/types.ts:2983

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: packages/ai/src/types.ts:2975

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: packages/ai/src/types.ts:2977

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: packages/ai/src/types.ts:2981

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: packages/ai/src/types.ts:2973

Pass this to `generateSpeech()` as `voice`
