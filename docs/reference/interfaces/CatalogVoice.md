---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:2496](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2496)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2504)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:2508](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2508)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2500)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:2502](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2502)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2506](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2506)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2498)

Pass this to `generateSpeech()` as `voice`
