---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1382](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1382)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1390)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1384](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1384)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1388](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1388)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1386](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1386)

**`Experimental`**

Current status of the job
