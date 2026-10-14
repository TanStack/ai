---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2654)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2668](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2668)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### body?

```ts
optional body?: undefined;
```

Defined in: [packages/ai/src/types.ts:2669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2669)

**`Experimental`**

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2660](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2660)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2656](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2656)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2658](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2658)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2666](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2666)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
