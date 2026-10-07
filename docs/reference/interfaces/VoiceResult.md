---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:2914](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2914)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2926](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2926)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2916](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2916)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2918](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2918)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:2922](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2922)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2924](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2924)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:2920](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2920)

The voices produced, best-first when the provider ranks them
