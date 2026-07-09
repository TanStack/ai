---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1996](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1996)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:2004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2004)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1998](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1998)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:2002](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2002)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2000](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2000)

**`Experimental`**

Current status of the job
