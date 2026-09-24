---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2080](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2080)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2082](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2082)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2088](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2088)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2086](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2086)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2085](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2085)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2081](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2081)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2084](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2084)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2087](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2087)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2104](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2104)

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

Defined in: [packages/ai/src/types.ts:2095](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2095)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2083](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2083)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2103)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
