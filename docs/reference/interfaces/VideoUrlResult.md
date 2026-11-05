---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2681](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2681)

Result containing the URL to a generated video.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2695](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2695)

Persisted artifact references for generated assets, when available

***

### body?

```ts
optional body?: undefined;
```

Defined in: [packages/ai/src/types.ts:2696](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2696)

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2687)

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2683](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2683)

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2685)

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2693](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2693)

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
