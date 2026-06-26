---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [packages/ai/src/types.ts:1772](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1772)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:1780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1780)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [packages/ai/src/types.ts:1774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1774)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [packages/ai/src/types.ts:1778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1778)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [packages/ai/src/types.ts:1776](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1776)

**`Experimental`**

Current status of the job
