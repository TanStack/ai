---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

# Interface: PersistedArtifactRef

Defined in: [packages/ai/src/types.ts:2264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2264)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2266)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2272](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2272)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2270](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2270)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2269](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2269)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2265](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2265)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2268](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2268)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2271)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2288](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2288)

#### activity

```ts
activity: PersistedArtifactActivity;
```

#### expiresAt?

```ts
optional expiresAt?: string;
```

#### jobId?

```ts
optional jobId?: string;
```

#### mediaType?

```ts
optional mediaType?: "json" | "image" | "audio" | "video" | "document";
```

#### model

```ts
model: string;
```

#### path

```ts
path: string;
```

#### provider

```ts
provider: string;
```

***

### sourceUrl?

```ts
optional sourceUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2279)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2267)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2287)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
