---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2226](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2226)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2240](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2240)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2232)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2228)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2230)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2238)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
