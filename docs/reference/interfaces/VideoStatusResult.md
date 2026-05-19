---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1565](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1565)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1573](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1573)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1567)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1571](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1571)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1569)

**`Experimental`**

Current status of the job
