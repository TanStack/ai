---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1823)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1831](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1831)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1825)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1827](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1827)

**`Experimental`**

Current status of the job
