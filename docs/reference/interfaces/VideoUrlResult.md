---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:1969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1969)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### expiresAt?

```ts
optional expiresAt: Date;
```

Defined in: [packages/ai/src/types.ts:1975](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1975)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1971)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:1973](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1973)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1981)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
