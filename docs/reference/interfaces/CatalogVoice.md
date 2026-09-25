---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:2641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2641)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2649](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2649)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:2653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2653)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2645)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:2647](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2647)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2651](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2651)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2643)

Pass this to `generateSpeech()` as `voice`
