---
id: ProcessOutputPayload
title: ProcessOutputPayload
---

# Interface: ProcessOutputPayload

Defined in: [packages/ai/src/custom-events.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L44)

## Properties

### chunk

```ts
chunk: string;
```

Defined in: [packages/ai/src/custom-events.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L48)

A chunk of stdout/stderr text.

***

### processId

```ts
processId: string;
```

Defined in: [packages/ai/src/custom-events.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L46)

Stable id for the spawned process whose output this is.
