---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2682](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2682)

Status of a video generation job.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2690)

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2684](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2684)

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2688](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2688)

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2686](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2686)

Current status of the job
