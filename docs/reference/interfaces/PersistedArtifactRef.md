---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2497)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2499)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2505](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2505)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2503](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2503)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2502](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2502)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2498)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2501)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2504)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2521](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2521)

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

Defined in: [packages/ai/src/types.ts:2512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2512)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2500)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2520)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
