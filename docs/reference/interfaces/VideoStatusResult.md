---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [types.ts:1085](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1085)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [types.ts:1093](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1093)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [types.ts:1087](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1087)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [types.ts:1091](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1091)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [types.ts:1089](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1089)

**`Experimental`**

Current status of the job
