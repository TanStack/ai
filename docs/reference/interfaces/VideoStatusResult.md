---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1803)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1811](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1811)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1805)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1809](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1809)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1807)

**`Experimental`**

Current status of the job
