---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2096](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2096)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2098](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2098)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2104](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2104)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2102](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2102)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2101](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2101)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2097](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2097)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2100](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2100)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2103)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2120)

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

Defined in: [packages/ai/src/types.ts:2111](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2111)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2099](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2099)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2119)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
