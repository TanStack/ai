---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1845](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1845)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1853](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1853)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1847](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1847)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1851](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1851)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1849](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1849)

**`Experimental`**

Current status of the job
