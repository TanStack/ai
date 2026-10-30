---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2663](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2663)

Result containing the URL to a generated video.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2677)

Persisted artifact references for generated assets, when available

***

### body?

```ts
optional body?: undefined;
```

Defined in: [packages/ai/src/types.ts:2678](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2678)

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2669)

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2665](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2665)

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2667)

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2675)

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
