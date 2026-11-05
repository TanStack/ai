---
id: VoiceResult
title: VoiceResult
---

Defined in: [packages/ai/src/types.ts:3176](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3176)

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3188](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3188)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3178](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3178)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3180](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3180)

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: [packages/ai/src/types.ts:3184](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3184)

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3186](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3186)

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: [packages/ai/src/types.ts:3182](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3182)

The voices produced, best-first when the provider ranks them
