---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/typescript/ai/src/types.ts:1300](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1300)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1308)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1302)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1306)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/typescript/ai/src/types.ts:1304](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1304)

**`Experimental`**

Current status of the job
