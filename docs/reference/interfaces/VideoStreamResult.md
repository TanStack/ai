---
id: VideoStreamResult
title: VideoStreamResult
---

Defined in: [packages/ai/src/types.ts:2686](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2686)

Video bytes from a provider that has no public URL for the finished video.
Core passes `body` to generation middleware, which streams it into storage
and sets `url`. Use `withGenerationPersistence` with `artifactUrl`.

## Properties

### body

```ts
body: ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/ai/src/types.ts:2690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2690)

The video bytes. Read once, with backpressure. Never buffer it whole.

***

### contentType

```ts
contentType: string;
```

Defined in: [packages/ai/src/types.ts:2692](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2692)

MIME type of `body`, e.g. `video/mp4`.

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2688](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2688)

Job identifier

***

### url?

```ts
optional url?: undefined;
```

Defined in: [packages/ai/src/types.ts:2694](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2694)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2693](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2693)
