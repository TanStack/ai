---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

# Interface: PersistedArtifactRef

Defined in: [packages/ai/src/types.ts:2243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2243)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2245](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2245)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2251)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2249](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2249)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2248](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2248)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2244](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2244)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2247)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2250](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2250)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2267)

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
optional mediaType?: "image" | "audio" | "video" | "document" | "json";
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

Defined in: [packages/ai/src/types.ts:2258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2258)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2246](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2246)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2266)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
