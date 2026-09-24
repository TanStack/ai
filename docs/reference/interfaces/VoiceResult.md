---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:2780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2780)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2792](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2792)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2782)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2784](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2784)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:2788](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2788)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2790](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2790)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:2786](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2786)

The voices produced, best-first when the provider ranks them
