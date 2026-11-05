---
id: VideoJobResult
title: VideoJobResult
---

Defined in: [packages/ai/src/types.ts:2651](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2651)

Result of creating a video generation job.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2661](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2661)

Durable artifact references, when generation persistence with an artifact +
blob store is wired. A submission has no video yet, so this only carries
refs for persisted prompt INPUTS (e.g. a start frame).

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2653)

Unique job identifier for polling status

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2655](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2655)

Model used for generation
