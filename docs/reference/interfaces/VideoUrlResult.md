---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:2186](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2186)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2200](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2200)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2192](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2192)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2188](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2188)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2190](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2190)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2198](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2198)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
