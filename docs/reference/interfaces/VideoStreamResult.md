---
id: VideoStreamResult
title: VideoStreamResult
---

Defined in: [packages/ai/src/types.ts:2442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2442)

**`Experimental`**

Video bytes from a provider that has no public URL for the finished video.
Core passes `body` to generation middleware, which streams it into storage
and sets `url`. Use `withGenerationPersistence` with `artifactUrl`.

 Video generation is an experimental feature and may change.

## Properties

### body

```ts
body: ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/ai/src/types.ts:2446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2446)

**`Experimental`**

The video bytes. Read once, with backpressure. Never buffer it whole.

***

### contentType

```ts
contentType: string;
```

Defined in: [packages/ai/src/types.ts:2448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2448)

**`Experimental`**

MIME type of `body`, e.g. `video/mp4`.

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2444)

**`Experimental`**

Job identifier

***

### url?

```ts
optional url?: undefined;
```

Defined in: [packages/ai/src/types.ts:2450](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2450)

**`Experimental`**

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2449)

**`Experimental`**
