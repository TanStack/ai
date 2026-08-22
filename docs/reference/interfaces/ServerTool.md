---
id: ServerTool
title: ServerTool
---

# Interface: ServerTool\<TInput, TOutput, TName, TContext, TNeedsApproval, TApprovalSchema\>

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L86)

Marker type for server-side tools

## Extends

- [`Tool`](Tool.md)\<`TInput`, `TOutput`, `TName`, `TContext`\>.`ToolApprovalCapabilityMarker`\<`TNeedsApproval`, `TApprovalSchema`\>

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
__toolSide: "server";
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L97)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L101)

***

### description

```ts
description: string;
```

Defined in: [packages/ai/src/types.ts:655](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L655)

Clear description of what the tool does.

This is crucial - the model uses this to decide when to call the tool.
Be specific about what the tool does, what parameters it needs, and what it returns.

#### Example

```ts
"Get the current weather in a given location. Returns temperature, conditions, and forecast."
```

#### Inherited from

[`Tool`](Tool.md).[`description`](Tool.md#description)

***

### execute?

```ts
optional execute?: ToolExecuteFunction<TInput, TOutput, TContext>;
```

Defined in: [packages/ai/src/types.ts:735](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L735)

Optional function to execute when the model calls this tool.

If provided, the SDK will automatically execute the function with the model's arguments
and feed the result back to the model. This enables autonomous tool use loops.

Can return any value - will be automatically stringified if needed.

#### Param

**args**

The arguments parsed from the model's tool call (validated against inputSchema)

#### Returns

Result to send back to the model (validated against outputSchema if provided)

#### Example

```ts
execute: async (args) => {
  const weather = await fetchWeather(args.location);
  return weather; // Can return object or string
}
```

#### Inherited from

[`Tool`](Tool.md).[`execute`](Tool.md#execute)

***

### inputSchema?

```ts
optional inputSchema?: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L98)

Schema describing the tool's input parameters.

Can be any Standard JSON Schema compliant schema (Zod, ArkType, Valibot, etc.) or a plain JSON Schema object.
Defines the structure and types of arguments the tool accepts.
The model will generate arguments matching this schema.
Standard JSON Schema compliant schemas are converted to JSON Schema for LLM providers.

#### See

 - https://standardschema.dev/json-schema
 - https://json-schema.org/

#### Examples

```ts
// Using Zod v4+ schema (natively supports Standard JSON Schema)
import { z } from 'zod';
z.object({
  location: z.string().describe("City name or coordinates"),
  unit: z.enum(["celsius", "fahrenheit"]).optional()
})
```

```ts
// Using ArkType (natively supports Standard JSON Schema)
import { type } from 'arktype';
type({
  location: 'string',
  unit: "'celsius' | 'fahrenheit'"
})
```

```ts
// Using plain JSON Schema
{
  type: 'object',
  properties: {
    location: { type: 'string', description: 'City name or coordinates' },
    unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
  },
  required: ['location']
}
```

#### Overrides

[`Tool`](Tool.md).[`inputSchema`](Tool.md#inputschema)

***

### lazy?

```ts
optional lazy?: boolean;
```

Defined in: [packages/ai/src/types.ts:741](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L741)

If true, this tool is lazy and will only be sent to the LLM after being discovered via the lazy tool discovery mechanism. Works with both chat() (the synthetic discovery tool) and Code Mode (kept out of the system prompt and revealed via discover_tools).

#### Inherited from

[`Tool`](Tool.md).[`lazy`](Tool.md#lazy)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:744](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L744)

Additional metadata for adapters or custom extensions

#### Inherited from

[`Tool`](Tool.md).[`metadata`](Tool.md#metadata)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/types.ts:645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L645)

Unique name of the tool (used by the model to call it).

Should be descriptive and follow naming conventions (e.g., snake_case or camelCase).
Must be unique within the tools array.

#### Example

```ts
"get_weather", "search_database", "sendEmail"
```

#### Inherited from

[`Tool`](Tool.md).[`name`](Tool.md#name)

***

### needsApproval?

```ts
optional needsApproval?: TNeedsApproval;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L100)

If true, tool execution requires user approval before running. Works with both server and client tools.

#### Overrides

[`Tool`](Tool.md).[`needsApproval`](Tool.md#needsapproval)

***

### outputSchema?

```ts
optional outputSchema?: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L99)

Optional schema for validating tool output.

Can be any Standard JSON Schema compliant schema or a plain JSON Schema object.
If provided with a Standard Schema compliant schema, tool results will be validated
against this schema before being sent back to the model. This catches bugs in tool
implementations and ensures consistent output formatting.

Note: This is client-side validation only - not sent to LLM providers.
Note: Plain JSON Schema output validation is not performed at runtime.

#### Example

```ts
// Using Zod
z.object({
  temperature: z.number(),
  conditions: z.string(),
  forecast: z.array(z.string()).optional()
})
```

#### Overrides

[`Tool`](Tool.md).[`outputSchema`](Tool.md#outputschema)
