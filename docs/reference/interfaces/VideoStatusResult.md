---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1637](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1637)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1645)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1639)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1643)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1641)

**`Experimental`**

Current status of the job
