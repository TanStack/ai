---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2286)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2294](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2294)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2288](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2288)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2292](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2292)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2290](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2290)

**`Experimental`**

Current status of the job
