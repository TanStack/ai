---
id: VideoStreamResult
title: VideoStreamResult
---

Defined in: [packages/ai/src/types.ts:2463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2463)

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

Defined in: [packages/ai/src/types.ts:2467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2467)

**`Experimental`**

The video bytes. Read once, with backpressure. Never buffer it whole.

***

### contentType

```ts
contentType: string;
```

Defined in: [packages/ai/src/types.ts:2469](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2469)

**`Experimental`**

MIME type of `body`, e.g. `video/mp4`.

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2465)

**`Experimental`**

Job identifier

***

### url?

```ts
optional url?: undefined;
```

Defined in: [packages/ai/src/types.ts:2471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2471)

**`Experimental`**

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2470)

**`Experimental`**
