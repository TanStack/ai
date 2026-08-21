---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName, TContext, TNeedsApproval, TApprovalSchema\>

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L107)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L118)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L129)

***

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L120)

***

### execute?

```ts
optional execute?: ToolExecuteFunction<TInput, TOutput, TContext>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L132)

***

### inputSchema?

```ts
optional inputSchema?: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L126)

***

### lazy?

```ts
optional lazy?: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L130)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L131)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L119)

***

### needsApproval?

```ts
optional needsApproval?: TNeedsApproval;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L128)

***

### outputSchema?

```ts
optional outputSchema?: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L127)
