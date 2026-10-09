---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2231)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2233](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2233)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2239](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2239)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2237)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2236](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2236)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2232)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2235](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2235)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2238)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2255)

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

Defined in: [packages/ai/src/types.ts:2246](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2246)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2234](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2234)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2254)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
