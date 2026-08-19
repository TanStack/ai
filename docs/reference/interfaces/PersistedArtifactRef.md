---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

# Interface: PersistedArtifactRef

Defined in: [packages/ai/src/types.ts:2251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2251)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2253)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2259](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2259)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2257](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2257)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2256)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2252)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2255)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2258)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2275](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2275)

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

Defined in: [packages/ai/src/types.ts:2266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2266)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2254)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2274](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2274)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
