---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:1839](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1839)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### expiresAt?

```ts
optional expiresAt: Date;
```

Defined in: [packages/ai/src/types.ts:1845](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1845)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1841](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1841)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:1843](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1843)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1851](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1851)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
