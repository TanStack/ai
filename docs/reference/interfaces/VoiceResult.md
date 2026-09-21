---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:2635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2635)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2647](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2647)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2637](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2637)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2639)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:2643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2643)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2645)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:2641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2641)

The voices produced, best-first when the provider ranks them
