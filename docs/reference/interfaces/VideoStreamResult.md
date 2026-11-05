---
id: VideoStreamResult
title: VideoStreamResult
---

Defined in: [packages/ai/src/types.ts:2704](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2704)

Video bytes from a provider that has no public URL for the finished video.
Core passes `body` to generation middleware, which streams it into storage
and sets `url`. Use `withGenerationPersistence` with `artifactUrl`.

## Properties

### body

```ts
body: ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/ai/src/types.ts:2708](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2708)

The video bytes. Read once, with backpressure. Never buffer it whole.

***

### contentType

```ts
contentType: string;
```

Defined in: [packages/ai/src/types.ts:2710](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2710)

MIME type of `body`, e.g. `video/mp4`.

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2706](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2706)

Job identifier

***

### url?

```ts
optional url?: undefined;
```

Defined in: [packages/ai/src/types.ts:2712](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2712)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2711](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2711)
