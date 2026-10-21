---
id: VoiceResult
title: VoiceResult
---

Defined in: packages/ai/src/types.ts:3109

Result of voice creation.

Design models typically return several candidates to choose between; clone
models return exactly one.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: packages/ai/src/types.ts:3121

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: packages/ai/src/types.ts:3111

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:3113

Model used for generation

***

### previewText?

```ts
optional previewText?: string;
```

Defined in: packages/ai/src/types.ts:3117

The line spoken in the previews, when the provider generated one

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/types.ts:3119

Token usage information (if provided by the adapter)

***

### voices

```ts
voices: GeneratedVoice[];
```

Defined in: packages/ai/src/types.ts:3115

The voices produced, best-first when the provider ranks them
