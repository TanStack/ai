---
id: VideoUrlResult
title: VideoUrlResult
---

Defined in: [packages/ai/src/types.ts:2417](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2417)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2431)

**`Experimental`**

Persisted artifact references for generated assets, when available

***

### body?

```ts
optional body?: undefined;
```

Defined in: [packages/ai/src/types.ts:2432](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2432)

**`Experimental`**

***

### expiresAt?

```ts
optional expiresAt?: Date;
```

Defined in: [packages/ai/src/types.ts:2423](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2423)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2419](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2419)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2421](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2421)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2429)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `billed` — the real
billed quantity paired with its unit — so consumers can compute exact cost.
