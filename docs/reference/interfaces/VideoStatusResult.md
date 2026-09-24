---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2270](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2270)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2278](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2278)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2272](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2272)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2276)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2274](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2274)

**`Experimental`**

Current status of the job
