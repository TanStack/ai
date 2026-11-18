---
id: ToolInputRepairContext
title: ToolInputRepairContext
---

Defined in: [packages/ai/src/types.ts:1347](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1347)

What a `repairToolInput` function gets: a tool input that failed the check.

## Properties

### error

```ts
error: Error;
```

Defined in: [packages/ai/src/types.ts:1355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1355)

The validation error. A Standard Schema error also has `issues`.

***

### input

```ts
input: unknown;
```

Defined in: [packages/ai/src/types.ts:1353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1353)

The input that failed, after approval edits and middleware.

***

### tool

```ts
tool: AnyTool;
```

Defined in: [packages/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1349)

The tool the model called.

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/types.ts:1351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1351)

The call, with its id and the raw arguments text.
