---
id: ToolInputRepairContext
title: ToolInputRepairContext
---

Defined in: [packages/ai/src/types.ts:1285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1285)

What a `repairToolInput` function gets: a tool input that failed the check.

## Properties

### error

```ts
error: Error;
```

Defined in: [packages/ai/src/types.ts:1293](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1293)

The validation error. A Standard Schema error also has `issues`.

***

### input

```ts
input: unknown;
```

Defined in: [packages/ai/src/types.ts:1291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1291)

The input that failed, after approval edits and middleware.

***

### tool

```ts
tool: AnyTool;
```

Defined in: [packages/ai/src/types.ts:1287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1287)

The tool the model called.

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/types.ts:1289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1289)

The call, with its id and the raw arguments text.
