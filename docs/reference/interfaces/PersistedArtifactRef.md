---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

# Interface: PersistedArtifactRef

Defined in: [packages/ai/src/types.ts:1998](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1998)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2000](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2000)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2006](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2006)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2004)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2003)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:1999](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1999)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2002](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2002)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2005](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2005)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2022](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2022)

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

Defined in: [packages/ai/src/types.ts:2013](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2013)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2001)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2021](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2021)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
