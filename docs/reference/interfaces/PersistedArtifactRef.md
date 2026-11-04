---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2464](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2464)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2466)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2472)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2470)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2469](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2469)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2465)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2468)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2471)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2488)

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

Defined in: [packages/ai/src/types.ts:2479](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2479)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2467)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2487)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
