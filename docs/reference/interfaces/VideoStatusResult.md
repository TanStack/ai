---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1601](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1601)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1609](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1609)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1603](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1603)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1607](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1607)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1605](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1605)

**`Experimental`**

Current status of the job
