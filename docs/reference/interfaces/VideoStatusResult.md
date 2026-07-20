---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1953](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1953)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1961](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1961)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1955](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1955)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1959](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1959)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1957](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1957)

**`Experimental`**

Current status of the job
