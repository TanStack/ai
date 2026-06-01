---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1665](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1665)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1673)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1667)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1671)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1669)

**`Experimental`**

Current status of the job
