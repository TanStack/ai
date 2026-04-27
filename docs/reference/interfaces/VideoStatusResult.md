---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1369)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1377)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1371](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1371)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1375](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1375)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1373](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1373)

**`Experimental`**

Current status of the job
