---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:2449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2449)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2463)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2455)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2451)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2453](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2453)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2461)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
