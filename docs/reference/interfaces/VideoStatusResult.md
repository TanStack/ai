---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1374)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1382](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1382)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1376)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1380](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1380)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1378](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1378)

**`Experimental`**

Current status of the job
