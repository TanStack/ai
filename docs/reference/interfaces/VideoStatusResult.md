---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1486](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1486)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1494](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1494)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1488)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1492)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1490)

**`Experimental`**

Current status of the job
