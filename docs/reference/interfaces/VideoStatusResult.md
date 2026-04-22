---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1276)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1284](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1284)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1278](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1278)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1282)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1280)

**`Experimental`**

Current status of the job
