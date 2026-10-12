---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:2935](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2935)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2947)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2937](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2937)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2939](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2939)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:2943](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2943)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2945](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2945)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:2941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2941)

The voices produced, best-first when the provider ranks them
