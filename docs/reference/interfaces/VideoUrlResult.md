---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:2001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2001)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### expiresAt?

```ts
optional expiresAt: Date;
```

Defined in: [packages/ai/src/types.ts:2007](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2007)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2003)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:2005](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2005)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2013](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2013)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
