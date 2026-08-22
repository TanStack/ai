---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

# Interface: PersistedArtifactRef

Defined in: [packages/ai/src/types.ts:1980](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1980)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:1982](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1982)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:1988](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1988)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:1986](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1986)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:1985](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1985)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:1981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1981)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:1984](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1984)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:1987](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1987)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2004)

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

Defined in: [packages/ai/src/types.ts:1995](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1995)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:1983](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1983)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2003)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
