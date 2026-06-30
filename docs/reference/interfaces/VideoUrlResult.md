---
id: VideoUrlResult
title: VideoUrlResult
---

# Interface: VideoUrlResult

Defined in: [packages/ai/src/types.ts:1819](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1819)

**`Experimental`**

Result containing the URL to a generated video.

 Video generation is an experimental feature and may change.

## Properties

### expiresAt?

```ts
optional expiresAt: Date;
```

Defined in: [packages/ai/src/types.ts:1825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1825)

**`Experimental`**

When the URL expires, if applicable

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1821](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1821)

**`Experimental`**

Job identifier

***

### url

```ts
url: string;
```

Defined in: [packages/ai/src/types.ts:1823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1823)

**`Experimental`**

URL to the generated video

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1831](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1831)

**`Experimental`**

Usage information for the completed generation, when the adapter can report
it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
real billed quantity — so consumers can compute exact cost.
