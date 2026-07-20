---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1985](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1985)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1993](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1993)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1987](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1987)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1991](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1991)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1989)

**`Experimental`**

Current status of the job
