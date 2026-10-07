---
id: VideoStatusResult
title: VideoStatusResult
---

Defined in: [packages/ai/src/types.ts:2401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2401)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:2409](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2409)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:2403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2403)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress?: number;
```

Defined in: [packages/ai/src/types.ts:2407](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2407)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:2405](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2405)

**`Experimental`**

Current status of the job
