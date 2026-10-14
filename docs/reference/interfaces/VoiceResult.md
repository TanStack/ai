---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:3151](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3151)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3163](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3163)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3153](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3153)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3155](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3155)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:3159](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3159)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3161](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3161)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:3157](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3157)

The voices produced, best-first when the provider ranks them
