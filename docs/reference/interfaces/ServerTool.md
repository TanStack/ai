---
id: ServerTool
title: ServerTool
---

# Interface: ServerTool\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:12](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L12)

Marker type for server-side tools

## Extends

- [`Tool`](Tool.md)\<`TInput`, `TOutput`, `TName`\>

## Type Parameters

### TInput

`TInput` *extends* `StandardSchemaV1` = `StandardSchemaV1`

### TOutput

`TOutput` *extends* `StandardSchemaV1` = `StandardSchemaV1`

### TName

`TName` *extends* `string` = `string`

## Properties

### \_\_toolSide

```ts
__toolSide: "server";
```

Defined in: [tools/tool-definition.ts:17](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L17)

***

### description

```ts
description: string;
```

Defined in: [types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

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

Defined in: [types.ts:359](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L359)

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

Defined in: [types.ts:322](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L322)

Standard Schema describing the tool's input parameters.

Defines the structure and types of arguments the tool accepts.
The model will generate arguments matching this schema.
The schema is converted to JSON Schema for LLM providers.

Supports any Standard Schema compliant library (Zod, Valibot, ArkType, etc.)

#### See

https://github.com/standard-schema/standard-schema

#### Examples

```ts
// Using Zod
import { z } from 'zod';

z.object({
  location: z.string().describe("City name or coordinates"),
  unit: z.enum(["celsius", "fahrenheit"]).optional()
})
```

```ts
// Using Valibot
import * as v from 'valibot';

v.object({
  location: v.string(),
  unit: v.optional(v.picklist(["celsius", "fahrenheit"]))
})
```

#### Inherited from

[`Tool`](Tool.md).[`inputSchema`](Tool.md#inputschema)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L365)

Additional metadata for adapters or custom extensions

#### Inherited from

[`Tool`](Tool.md).[`metadata`](Tool.md#metadata)

***

### name

```ts
name: TName;
```

Defined in: [types.ts:281](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L281)

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

Defined in: [types.ts:362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L362)

If true, tool execution requires user approval before running. Works with both server and client tools.

#### Inherited from

[`Tool`](Tool.md).[`needsApproval`](Tool.md#needsapproval)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [types.ts:340](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L340)

Optional Standard Schema for validating tool output.

If provided, tool results will be validated against this schema before
being sent back to the model. This catches bugs in tool implementations
and ensures consistent output formatting.

Note: This is client-side validation only - not sent to LLM providers.

#### Example

```ts
z.object({
  temperature: z.number(),
  conditions: z.string(),
  forecast: z.array(z.string()).optional()
})
```

#### Inherited from

[`Tool`](Tool.md).[`outputSchema`](Tool.md#outputschema)

***

### toJsonSchema()?

```ts
optional toJsonSchema: (inputSchema) => Record<string, any> | undefined;
```

Defined in: [types.ts:386](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L386)

Optional function to convert the inputSchema to JSON Schema format.

This allows tools to use any schema library (Zod, Valibot, ArkType, etc.)
and provide their own conversion logic. Each adapter will call this function
to get the JSON Schema representation of the tool's parameters.

#### Parameters

##### inputSchema

`StandardSchemaV1`

The Standard Schema input schema to convert

#### Returns

`Record`\<`string`, `any`\> \| `undefined`

JSON Schema object describing the tool's input parameters, or undefined

#### Example

```ts
// With Zod
import { toJSONSchema } from 'zod';
toJsonSchema: (schema) => toJSONSchema(schema)

// With Valibot
import { toJSONSchema } from '@valibot/to-json-schema';
toJsonSchema: (schema) => toJSONSchema(schema)
```

#### Inherited from

[`Tool`](Tool.md).[`toJsonSchema`](Tool.md#tojsonschema)
