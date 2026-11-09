---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2667)

Status of a video generation job.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2675)

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2669)

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2673)

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2671)

Current status of the job
