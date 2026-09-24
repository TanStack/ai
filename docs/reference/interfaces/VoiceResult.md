---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:2717](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2717)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2729)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2719](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2719)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2721](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2721)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:2725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2725)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2727)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:2723](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2723)

The voices produced, best-first when the provider ranks them
