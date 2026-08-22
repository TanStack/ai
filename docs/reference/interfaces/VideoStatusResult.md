---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:2170](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2170)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2178](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2178)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2172](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2172)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2176](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2176)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2174](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2174)

**`Experimental`**

Current status of the job
