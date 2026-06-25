---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:1766](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1766)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### expiresAt?

```ts
optional expiresAt: Date;
```

Defined in: [packages/ai/src/types.ts:1772](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1772)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1768)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:1770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1770)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1778)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
