---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2638)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2646](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2646)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2640](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2640)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2644](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2644)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2642)

**`Experimental`**

Current status of the job
