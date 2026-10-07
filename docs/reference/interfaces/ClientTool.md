---
id: ClientTool
title: ClientTool
---

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L108)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L119)

***

### \[toolApprovalCapability\]?

```ts
readonly optional [toolApprovalCapability]?: object;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L26)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L130)

***

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L121)

***

### execute?

```ts
optional execute?: ToolExecuteFunction<TInput, TOutput, TContext>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L134)

***

### execution?

```ts
optional execution?: "task";
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L131)

***

### inputSchema?

```ts
optional inputSchema?: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L127)

***

### lazy?

```ts
optional lazy?: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L132)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L133)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L120)

***

### needsApproval?

```ts
optional needsApproval?: TNeedsApproval;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L129)

***

### outputSchema?

```ts
optional outputSchema?: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L128)
