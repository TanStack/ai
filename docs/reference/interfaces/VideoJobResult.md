---
id: VideoJobResult
title: VideoJobResult
---

Defined in: [packages/ai/src/types.ts:2404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2404)

**`Experimental`**

Result of creating a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2414)

**`Experimental`**

Durable artifact references, when generation persistence with an artifact +
blob store is wired. A submission has no video yet, so this only carries
refs for persisted prompt INPUTS (e.g. a start frame).

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2406](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2406)

**`Experimental`**

Unique job identifier for polling status

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2408)

**`Experimental`**

Model used for generation
