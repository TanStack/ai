---
id: ToolDefinitionInstance
title: ToolDefinitionInstance
---

# Interface: ToolDefinitionInstance\<TInput, TOutput, TName\>

Defined in: [activities/chat/tools/tool-definition.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L43)

Tool definition that can be used directly or instantiated for server/client

## Extends

- [`Tool`](Tool.md)\<`TInput`, `TOutput`, `TName`\>

## Extended by

- [`ToolDefinition`](ToolDefinition.md)

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

## Properties

### \_\_toolSide

```ts
__toolSide: "definition";
```

Defined in: [activities/chat/tools/tool-definition.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L48)

***

### description

```ts
description: string;
```

Defined in: [types.ts:383](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L383)

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

### execute()?

```ts
optional execute: (args) => any;
```

Defined in: [types.ts:463](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L463)

Optional function to execute when the model calls this tool.

If provided, the SDK will automatically execute the function with the model's arguments
and feed the result back to the model. This enables autonomous tool use loops.

Can return any value - will be automatically stringified if needed.

#### Parameters

##### args

`any`

The arguments parsed from the model's tool call (validated against inputSchema)

#### Returns

`any`

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
optional inputSchema: TInput;
```

Defined in: [types.ts:423](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L423)

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

#### Inherited from

[`Tool`](Tool.md).[`inputSchema`](Tool.md#inputschema)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:469](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L469)

Additional metadata for adapters or custom extensions

#### Inherited from

[`Tool`](Tool.md).[`metadata`](Tool.md#metadata)

***

### name

```ts
name: TName;
```

Defined in: [types.ts:373](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L373)

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
optional needsApproval: boolean;
```

Defined in: [types.ts:466](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L466)

If true, tool execution requires user approval before running. Works with both server and client tools.

#### Inherited from

[`Tool`](Tool.md).[`needsApproval`](Tool.md#needsapproval)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [types.ts:444](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L444)

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

#### Inherited from

[`Tool`](Tool.md).[`outputSchema`](Tool.md#outputschema)
