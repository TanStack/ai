---
id: PersistedArtifactRef
title: PersistedArtifactRef
---

Defined in: [packages/ai/src/types.ts:2020](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2020)

## Properties

### artifactId

```ts
artifactId: string;
```

Defined in: [packages/ai/src/types.ts:2022](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2022)

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/ai/src/types.ts:2028](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2028)

***

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:2026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2026)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:2025](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2025)

***

### role

```ts
role: PersistedArtifactRole;
```

Defined in: [packages/ai/src/types.ts:2021](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2021)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/types.ts:2024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2024)

***

### size

```ts
size: number;
```

Defined in: [packages/ai/src/types.ts:2027](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2027)

***

### source

```ts
source: object;
```

Defined in: [packages/ai/src/types.ts:2044](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2044)

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

Defined in: [packages/ai/src/types.ts:2035](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2035)

Where these bytes were fetched FROM — the provider's original result URL,
or a caller-supplied prompt URL when `allowInputUrl` opted that in. Usually
expiring, and provenance only: serve from [PersistedArtifactRef.url](#url)
instead.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2023](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2023)

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2043](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2043)

Durable app-origin URL that serves this artifact's persisted bytes (your
`GET` route around `retrieveArtifact` / `retrieveBlob`). Stamped by
`withGenerationPersistence`'s `artifactUrl` option, so clients render and
restore durable media from your own origin rather than the provider's
expiring link.
