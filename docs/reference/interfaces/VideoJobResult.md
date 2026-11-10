---
id: VideoJobResult
title: VideoJobResult
---

Defined in: [packages/ai/src/types.ts:2666](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2666)

Result of creating a video generation job.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2676](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2676)

Durable artifact references, when generation persistence with an artifact +
blob store is wired. A submission has no video yet, so this only carries
refs for persisted prompt INPUTS (e.g. a start frame).

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2668](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2668)

Unique job identifier for polling status

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2670](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2670)

Model used for generation
