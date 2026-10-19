---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2674](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2674)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2682](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2682)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2676](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2676)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2680](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2680)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2678](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2678)

**`Experimental`**

Current status of the job
