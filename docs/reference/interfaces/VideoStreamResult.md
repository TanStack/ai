---
id: VideoStreamResult
title: VideoStreamResult
---

Defined in: [packages/ai/src/types.ts:2715](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2715)

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

Defined in: [packages/ai/src/types.ts:2719](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2719)

**`Experimental`**

The video bytes. Read once, with backpressure. Never buffer it whole.

***

### contentType

```ts
contentType: string;
```

Defined in: [packages/ai/src/types.ts:2721](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2721)

**`Experimental`**

MIME type of `body`, e.g. `video/mp4`.

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2717](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2717)

**`Experimental`**

Job identifier

***

### url?

```ts
optional url?: undefined;
```

Defined in: [packages/ai/src/types.ts:2723](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2723)

**`Experimental`**

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2722](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2722)

**`Experimental`**
