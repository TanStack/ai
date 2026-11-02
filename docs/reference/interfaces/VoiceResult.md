---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:3158](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3158)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3170](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3170)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3160](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3160)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3162](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3162)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:3166](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3166)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3168](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3168)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:3164](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3164)

The voices produced, best-first when the provider ranks them
