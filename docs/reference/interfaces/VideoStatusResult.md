---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1517)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1525)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1519)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1523)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1521](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1521)

**`Experimental`**

Current status of the job
