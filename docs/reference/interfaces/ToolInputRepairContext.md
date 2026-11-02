---
id: ToolInputRepairContext
title: ToolInputRepairContext
---

Defined in: [packages/ai/src/types.ts:1332](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1332)

What a `repairToolInput` function gets: a tool input that failed the check.

## Properties

### error

```ts
error: Error;
```

Defined in: [packages/ai/src/types.ts:1340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1340)

The validation error. A Standard Schema error also has `issues`.

***

### input

```ts
input: unknown;
```

Defined in: [packages/ai/src/types.ts:1338](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1338)

The input that failed, after approval edits and middleware.

***

### tool

```ts
tool: AnyTool;
```

Defined in: [packages/ai/src/types.ts:1334](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1334)

The tool the model called.

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/types.ts:1336](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1336)

The call, with its id and the raw arguments text.
