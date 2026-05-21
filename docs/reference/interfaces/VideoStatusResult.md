---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1584](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1584)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1592](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1592)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1586](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1586)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1590](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1590)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1588](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1588)

**`Experimental`**

Current status of the job
