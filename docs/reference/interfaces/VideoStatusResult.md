---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1585](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1585)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1593](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1593)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1587](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1587)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1591](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1591)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1589](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1589)

**`Experimental`**

Current status of the job
