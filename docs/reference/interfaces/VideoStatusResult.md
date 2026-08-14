---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:2433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2433)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2441)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2435)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2439)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2437)

**`Experimental`**

Current status of the job
