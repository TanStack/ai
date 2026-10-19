---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:3187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3187)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3199](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3199)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3189)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3191](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3191)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:3195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3195)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3197](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3197)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:3193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3193)

The voices produced, best-first when the provider ranks them
