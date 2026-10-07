---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2210](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2210)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2212)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2218](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2218)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2216)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2215](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2215)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2211](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2211)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2214)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2217)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2234](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2234)

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

Defined in: [packages/ai/src/types.ts:2225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2225)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2213](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2213)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2233](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2233)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
