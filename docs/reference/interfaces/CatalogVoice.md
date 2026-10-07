---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:2775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2775)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2783](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2783)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:2787](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2787)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2779)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:2781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2781)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2785](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2785)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2777)

Pass this to `generateSpeech()` as `voice`
