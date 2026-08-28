---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:2188](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2188)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2196](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2196)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2190](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2190)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2194](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2194)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2192](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2192)

**`Experimental`**

Current status of the job
