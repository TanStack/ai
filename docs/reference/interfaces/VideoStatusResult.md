---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [types.ts:874](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L874)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [types.ts:882](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L882)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [types.ts:876](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L876)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [types.ts:880](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L880)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [types.ts:878](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L878)

**`Experimental`**

Current status of the job
