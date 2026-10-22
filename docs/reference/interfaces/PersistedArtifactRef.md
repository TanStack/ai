---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2489)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2491](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2491)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2497)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2495)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2494](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2494)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2490)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2493](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2493)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2496](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2496)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2513](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2513)

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

Defined in: [packages/ai/src/types.ts:2504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2504)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2492)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2512)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
