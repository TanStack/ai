---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:2441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2441)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2449)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2443)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2447)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2445)

**`Experimental`**

Current status of the job
