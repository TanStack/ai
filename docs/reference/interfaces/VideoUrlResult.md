---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2302](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2302)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2316](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2316)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2308](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2308)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2304](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2304)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2306](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2306)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2314](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2314)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
