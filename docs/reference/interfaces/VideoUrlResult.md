---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2696](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2696)

Result containing the URL to a generated video.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2710](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2710)

Persisted artifact references for generated assets, when available

***

### body?

```ts
optional body?: undefined;
```

Defined in: [packages/ai/src/types.ts:2711](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2711)

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2702](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2702)

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2698](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2698)

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2700](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2700)

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2708](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2708)

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
