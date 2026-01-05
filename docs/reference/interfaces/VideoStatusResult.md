---
id: VideoStatusResult
title: VideoStatusResult
---

# Interface: VideoStatusResult

Defined in: [types.ts:879](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L879)

**`Experimental`**

Status of a video generation job.

 Video generation is an experimental feature and may change.

## Properties

### error?

```ts
optional error: string;
```

Defined in: [types.ts:887](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L887)

**`Experimental`**

Error message if status is 'failed'

***

### jobId

```ts
jobId: string;
```

Defined in: [types.ts:881](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L881)

**`Experimental`**

Job identifier

***

### progress?

```ts
optional progress: number;
```

Defined in: [types.ts:885](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L885)

**`Experimental`**

Progress percentage (0-100), if available

***

### status

```ts
status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [types.ts:883](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L883)

**`Experimental`**

Current status of the job
