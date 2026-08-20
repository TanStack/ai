---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:2446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2446)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2454](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2454)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2448)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2452](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2452)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2450](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2450)

**`Experimental`**

Current status of the job
