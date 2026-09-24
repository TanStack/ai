---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2286)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2300](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2300)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2292](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2292)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2288](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2288)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2290](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2290)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2298)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
