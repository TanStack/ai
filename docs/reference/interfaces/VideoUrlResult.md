---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:2012](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2012)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2026)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt: Date;
```

Defined in: [packages/ai/src/types.ts:2018](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2018)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2014](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2014)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2016](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2016)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2024)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
