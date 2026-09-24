---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:2657](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2657)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2669)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2659](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2659)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2661](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2661)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:2665](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2665)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2667)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:2663](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2663)

The voices produced, best-first when the provider ranks them
