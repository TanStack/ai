---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [types.ts:1109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1109)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [types.ts:1117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1117)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [types.ts:1111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1111)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [types.ts:1115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1115)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [types.ts:1113](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1113)

**`Experimental`**

Current status of the job
