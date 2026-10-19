---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2483](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2483)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2485](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2485)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2491](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2491)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2489)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2488)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2484](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2484)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2487)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2490)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2507](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2507)

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

Defined in: [packages/ai/src/types.ts:2498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2498)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2486)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2506](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2506)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
