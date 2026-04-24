---
id: ToolDefinition
title: ToolDefinition
---

# Interface: ToolDefinition\<TInput, TOutput, TName\>

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L107)

Tool definition builder that allows creating server or client tools from a shared definition

## Extends

- [`ToolDefinitionInstance`](ToolDefinitionInstance.md)\<`TInput`, `TOutput`, `TName`\>

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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L50)

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`__toolSide`](ToolDefinitionInstance.md#__toolside)

***

### client()

```ts
client: (execute?) => ClientTool<TInput, TOutput, TName>;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:125](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L125)

Create a client-side tool with optional execute function

#### Parameters

##### execute?

(`args`) => 
  \| [`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>
  \| `Promise`\<[`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>\>

#### Returns

[`ClientTool`](ClientTool.md)\<`TInput`, `TOutput`, `TName`\>

***

### description

```ts
description: string;
```

Defined in: [packages/typescript/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L440)

Clear description of what the tool does.

This is crucial - the model uses this to decide when to call the tool.
Be specific about what the tool does, what parameters it needs, and what it returns.

#### Example

```ts
"Get the current weather in a given location. Returns temperature, conditions, and forecast."
```

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`description`](ToolDefinitionInstance.md#description)

***

### execute()?

```ts
optional execute: (args, context?) => any;
```

Defined in: [packages/typescript/ai/src/types.ts:520](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L520)

Optional function to execute when the model calls this tool.

If provided, the SDK will automatically execute the function with the model's arguments
and feed the result back to the model. This enables autonomous tool use loops.

Can return any value - will be automatically stringified if needed.

#### Parameters

##### args

`any`

The arguments parsed from the model's tool call (validated against inputSchema)

##### context?

[`ToolExecutionContext`](ToolExecutionContext.md)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`execute`](ToolDefinitionInstance.md#execute)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [packages/typescript/ai/src/types.ts:480](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L480)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`inputSchema`](ToolDefinitionInstance.md#inputschema)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [packages/typescript/ai/src/types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

If true, this tool is lazy and will only be sent to the LLM after being discovered via the lazy tool discovery mechanism. Only meaningful when used with chat().

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`lazy`](ToolDefinitionInstance.md#lazy)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [packages/typescript/ai/src/types.ts:529](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L529)

Additional metadata for adapters or custom extensions

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`metadata`](ToolDefinitionInstance.md#metadata)

***

### name

```ts
name: TName;
```

Defined in: [packages/typescript/ai/src/types.ts:430](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L430)

Unique name of the tool (used by the model to call it).

Should be descriptive and follow naming conventions (e.g., snake_case or camelCase).
Must be unique within the tools array.

#### Example

```ts
"get_weather", "search_database", "sendEmail"
```

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`name`](ToolDefinitionInstance.md#name)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [packages/typescript/ai/src/types.ts:523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L523)

If true, tool execution requires user approval before running. Works with both server and client tools.

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`needsApproval`](ToolDefinitionInstance.md#needsapproval)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [packages/typescript/ai/src/types.ts:501](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L501)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`outputSchema`](ToolDefinitionInstance.md#outputschema)

***

### server()

```ts
server: (execute) => ServerTool<TInput, TOutput, TName>;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L115)

Create a server-side tool with execute function

#### Parameters

##### execute

(`args`, `context?`) => 
  \| [`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>
  \| `Promise`\<[`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>\>

#### Returns

[`ServerTool`](ServerTool.md)\<`TInput`, `TOutput`, `TName`\>
