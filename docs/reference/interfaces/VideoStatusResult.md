---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1944](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1944)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1952](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1952)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1946](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1946)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1950](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1950)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1948](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1948)

**`Experimental`**

Current status of the job
