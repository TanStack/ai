---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:2457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2457)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2471)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2463)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2459)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2461)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2469](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2469)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (for example fal) this carries `billed`, the
real billed quantity paired with its unit, so consumers can compute exact cost.
