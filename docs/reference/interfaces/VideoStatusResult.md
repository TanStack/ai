---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2422)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2430)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2424](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2424)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2428)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2426](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2426)

**`Experimental`**

Current status of the job
