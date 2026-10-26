---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: packages/ai/src/types.ts:2649

Status of a video generation job.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: packages/ai/src/types.ts:2657

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: packages/ai/src/types.ts:2651

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: packages/ai/src/types.ts:2655

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: packages/ai/src/types.ts:2653

Current status of the job
