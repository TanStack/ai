---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1630)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1638)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1632)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1636)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1634)

**`Experimental`**

Current status of the job
