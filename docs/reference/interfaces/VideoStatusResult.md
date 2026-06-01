---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1687)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1695](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1695)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1689](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1689)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1693](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1693)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1691](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1691)

**`Experimental`**

Current status of the job
