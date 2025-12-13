---
id: Tool
title: Tool
---

# Interface: Tool\<TInput, TOutput, TName\>

Defined in: [types.ts:320](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L320)

Tool/Function definition for function calling.

Tools allow the model to interact with external systems, APIs, or perform computations.
The model will decide when to call tools based on the user's request and the tool descriptions.

Tools can use either Zod schemas or JSON Schema objects for runtime validation and type safety.

## See

 - https://platform.openai.com/docs/guides/function-calling
 - https://docs.anthropic.com/claude/docs/tool-use

## Extended by

- [`ToolDefinitionInstance`](ToolDefinitionInstance.md)
- [`ServerTool`](ServerTool.md)

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = `z.ZodType`

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = `z.ZodType`

### TName

`TName` *extends* `string` = `string`

## Properties

### description

```ts
description: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

Clear description of what the tool does.

This is crucial - the model uses this to decide when to call the tool.
Be specific about what the tool does, what parameters it needs, and what it returns.

#### Example

```ts
"Get the current weather in a given location. Returns temperature, conditions, and forecast."
```

***

### execute()?

```ts
optional execute: (args) => any;
```

Defined in: [types.ts:414](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L414)

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

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [types.ts:375](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L375)

Schema describing the tool's input parameters.

Can be either a Zod schema or a JSON Schema object.
Defines the structure and types of arguments the tool accepts.
The model will generate arguments matching this schema.
Zod schemas are converted to JSON Schema for LLM providers.

#### See

 - https://zod.dev/
 - https://json-schema.org/

#### Examples

```ts
// Using Zod schema
import { z } from 'zod';
z.object({
  location: z.string().describe("City name or coordinates"),
  unit: z.enum(["celsius", "fahrenheit"]).optional()
})
```

```ts
// Using JSON Schema
{
  type: 'object',
  properties: {
    location: { type: 'string', description: 'City name or coordinates' },
    unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
  },
  required: ['location']
}
```

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:420](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L420)

Additional metadata for adapters or custom extensions

***

### name

```ts
name: TName;
```

Defined in: [types.ts:333](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L333)

Unique name of the tool (used by the model to call it).

Should be descriptive and follow naming conventions (e.g., snake_case or camelCase).
Must be unique within the tools array.

#### Example

```ts
"get_weather", "search_database", "sendEmail"
```

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [types.ts:417](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L417)

If true, tool execution requires user approval before running. Works with both server and client tools.

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [types.ts:395](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L395)

Optional schema for validating tool output.

Can be either a Zod schema or a JSON Schema object.
If provided with a Zod schema, tool results will be validated against this schema before
being sent back to the model. This catches bugs in tool implementations
and ensures consistent output formatting.

Note: This is client-side validation only - not sent to LLM providers.
Note: JSON Schema output validation is not performed at runtime.

#### Example

```ts
z.object({
  temperature: z.number(),
  conditions: z.string(),
  forecast: z.array(z.string()).optional()
})
```
