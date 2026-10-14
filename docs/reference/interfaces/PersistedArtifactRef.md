---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2447)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2449)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2455)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2453](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2453)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2452](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2452)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2448)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2451)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2454](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2454)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2471)

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

Defined in: [packages/ai/src/types.ts:2462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2462)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2450](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2450)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2470)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
