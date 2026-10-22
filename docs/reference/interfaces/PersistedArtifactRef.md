---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: packages/ai/src/types.ts:2406

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: packages/ai/src/types.ts:2408

***

### createdAt

```ts
createdAt: string;
```

Defined in: packages/ai/src/types.ts:2414

***

### mimeType

```ts
mimeType: string;
```

Defined in: packages/ai/src/types.ts:2412

***

### name

```ts
name: string;
```

Defined in: packages/ai/src/types.ts:2411

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: packages/ai/src/types.ts:2407

***

### runId

```ts
runId: string;
```

Defined in: packages/ai/src/types.ts:2410

***

### size

```ts
size: number;
```

Defined in: packages/ai/src/types.ts:2413

***

### source

```ts
source: object;
```

Defined in: packages/ai/src/types.ts:2430

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

Defined in: packages/ai/src/types.ts:2421

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/types.ts:2409

***

### url?

```ts
optional url?: string;
```

Defined in: packages/ai/src/types.ts:2429

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
