---
id: CatalogVoice
title: CatalogVoice
---

Defined in: [packages/ai/src/types.ts:2796](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2796)

One voice from a provider's catalog.

## Properties

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2804](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2804)

Provider description of the voice

***

### labels?

```ts
optional labels?: Record<string, string>;
```

Defined in: [packages/ai/src/types.ts:2808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2808)

Provider labels, such as accent, age, or use case

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2800](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2800)

Display name, when the provider stores one

***

### origin?

```ts
optional origin?: VoiceOrigin;
```

Defined in: [packages/ai/src/types.ts:2802](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2802)

Where the voice came from

***

### previewUrl?

```ts
optional previewUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2806)

URL of a sample, when the provider hosts one

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2798](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2798)

Pass this to `generateSpeech()` as `voice`
