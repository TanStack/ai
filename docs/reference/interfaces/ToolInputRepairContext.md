---
id: ToolInputRepairContext
title: ToolInputRepairContext
---

Defined in: packages/ai/src/types.ts:1292

What a `repairToolInput` function gets: a tool input that failed the check.

## Properties

### error

```ts
error: Error;
```

Defined in: packages/ai/src/types.ts:1300

The validation error. A Standard Schema error also has `issues`.

***

### input

```ts
input: unknown;
```

Defined in: packages/ai/src/types.ts:1298

The input that failed, after approval edits and middleware.

***

### tool

```ts
tool: AnyTool;
```

Defined in: packages/ai/src/types.ts:1294

The tool the model called.

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: packages/ai/src/types.ts:1296

The call, with its id and the raw arguments text.
