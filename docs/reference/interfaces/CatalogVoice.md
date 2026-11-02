---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:3019](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3019)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:3027](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3027)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:3031](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3031)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:3023](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3023)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:3025](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3025)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:3029](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3029)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:3021](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3021)

Pass this to `generateSpeech()` as `voice`
