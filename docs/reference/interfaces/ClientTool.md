---
id: ClientTool
title: ClientTool
---

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:108

Marker type for client-side tools

## Extends

- `ToolApprovalCapabilityMarker`\<`TNeedsApproval`, `TApprovalSchema`\>

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

### TName

`TName` *extends* `string` = `string`

### TContext

`TContext` = `unknown`

### TNeedsApproval

`TNeedsApproval` *extends* `boolean` = `false`

### TApprovalSchema

`TApprovalSchema` *extends* 
  \| [`ApprovalSchemaConfig`](../type-aliases/ApprovalSchemaConfig.md)
  \| `undefined` = `undefined`

## Properties

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:119

***

### \[toolApprovalCapability\]?

```ts
readonly optional [toolApprovalCapability]?: object;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:26

#### approvalSchema

```ts
approvalSchema: TApprovalSchema;
```

#### needsApproval

```ts
needsApproval: TNeedsApproval;
```

#### Inherited from

```ts
ToolApprovalCapabilityMarker.[toolApprovalCapability]
```

***

### approvalSchema?

```ts
optional approvalSchema?: TApprovalSchema;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:130

***

### description

```ts
description: string;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:121

***

### execute?

```ts
optional execute?: ToolExecuteFunction<TInput, TOutput, TContext>;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:135

***

### execution?

```ts
optional execution?: "task";
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:131

***

### inputSchema?

```ts
optional inputSchema?: TInput;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:127

***

### lazy?

```ts
optional lazy?: boolean;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:132

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:134

***

### name

```ts
name: TName;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:120

***

### needsApproval?

```ts
optional needsApproval?: TNeedsApproval;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:129

***

### outputSchema?

```ts
optional outputSchema?: TOutput;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:128

***

### replay?

```ts
optional replay?: "safe" | "never";
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:133
