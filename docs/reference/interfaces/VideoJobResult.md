---
id: VideoJobResult
title: VideoJobResult
---

# Interface: VideoJobResult

Defined in: [packages/ai/src/types.ts:2423](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2423)

**`Experimental`**

Result of creating a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2433)

**`Experimental`**

Durable artifact references, when generation persistence with an artifact +
blob store is wired. A submission has no video yet, so this only carries
refs for persisted prompt INPUTS (e.g. a start frame).

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2425](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2425)

**`Experimental`**

Unique job identifier for polling status

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2427)

**`Experimental`**

Model used for generation
