---
id: VideoJobResult
title: VideoJobResult
---

Defined in: packages/ai/src/types.ts:2633

Result of creating a video generation job.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: packages/ai/src/types.ts:2643

Durable artifact references, when generation persistence with an artifact +
blob store is wired. A submission has no video yet, so this only carries
refs for persisted prompt INPUTS (e.g. a start frame).

***

### jobId

```ts
jobId: string;
```

Defined in: packages/ai/src/types.ts:2635

Unique job identifier for polling status

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:2637

Model used for generation
