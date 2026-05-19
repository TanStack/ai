---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1575](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1575)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1583](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1583)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1577](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1577)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1581](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1581)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1579](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1579)

**`Experimental`**

Current status of the job
