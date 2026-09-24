---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2210](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2210)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2218](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2218)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2212)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2216)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2214)

**`Experimental`**

Current status of the job
