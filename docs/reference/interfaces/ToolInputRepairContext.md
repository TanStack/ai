---
id: ToolInputRepairContext
title: ToolInputRepairContext
---

Defined in: packages/ai/src/types.ts:1291

What a `repairToolInput` function gets: a tool input that failed the check.

## Properties

### error

```ts
error: Error;
```

Defined in: packages/ai/src/types.ts:1299

The validation error. A Standard Schema error also has `issues`.

***

### input

```ts
input: unknown;
```

Defined in: packages/ai/src/types.ts:1297

The input that failed, after approval edits and middleware.

***

### tool

```ts
tool: AnyTool;
```

Defined in: packages/ai/src/types.ts:1293

The tool the model called.

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: packages/ai/src/types.ts:1295

The call, with its id and the raw arguments text.
