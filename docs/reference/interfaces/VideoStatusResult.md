---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1750)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1758](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1758)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1752)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1756](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1756)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1754](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1754)

**`Experimental`**

Current status of the job
