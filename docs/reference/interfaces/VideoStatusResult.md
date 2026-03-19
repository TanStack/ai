---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [types.ts:1102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1102)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [types.ts:1110](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1110)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [types.ts:1104](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1104)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [types.ts:1108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1108)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [types.ts:1106](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1106)

**`Experimental`**

Current status of the job
