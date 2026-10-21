---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: packages/ai/src/types.ts:2612

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: packages/ai/src/types.ts:2626

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### body?

```ts
optional body?: undefined;
```

Defined in: packages/ai/src/types.ts:2627

**`Experimental`**

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: packages/ai/src/types.ts:2618

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: packages/ai/src/types.ts:2614

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: packages/ai/src/types.ts:2616

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/types.ts:2624

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
