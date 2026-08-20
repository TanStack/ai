---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

# Interface: PersistedArtifactRef

Defined in: [packages/ai/src/types.ts:2256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2256)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2258)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2264)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2262](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2262)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2261)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2257](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2257)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2260)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2263)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2280](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2280)

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
optional mediaType?: "image" | "audio" | "video" | "document" | "json";
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

Defined in: [packages/ai/src/types.ts:2271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2271)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2259](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2259)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2279)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
