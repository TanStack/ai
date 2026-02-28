---
id: ToolDefinition
title: ToolDefinition
---

# Interface: ToolDefinition\<TInput, TOutput, TName\>

Defined in: [activities/chat/tools/tool-definition.ts:104](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L104)

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

Defined in: [activities/chat/tools/tool-definition.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L48)

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`__toolSide`](ToolDefinitionInstance.md#__toolside)

***

### client()

```ts
client: (execute?) => ClientTool<TInput, TOutput, TName>;
```

Defined in: [activities/chat/tools/tool-definition.ts:121](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L121)

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

Defined in: [types.ts:383](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L383)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`execute`](ToolDefinitionInstance.md#execute)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`inputSchema`](ToolDefinitionInstance.md#inputschema)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:469](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L469)

Additional metadata for adapters or custom extensions

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`metadata`](ToolDefinitionInstance.md#metadata)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`name`](ToolDefinitionInstance.md#name)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [types.ts:466](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L466)

If true, tool execution requires user approval before running. Works with both server and client tools.

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`needsApproval`](ToolDefinitionInstance.md#needsapproval)

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`outputSchema`](ToolDefinitionInstance.md#outputschema)

***

### server()

```ts
server: (execute) => ServerTool<TInput, TOutput, TName>;
```

Defined in: [activities/chat/tools/tool-definition.ts:112](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L112)

Create a server-side tool with execute function

#### Parameters

##### execute

(`args`) => 
  \| [`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>
  \| `Promise`\<[`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>\>

#### Returns

[`ServerTool`](ServerTool.md)\<`TInput`, `TOutput`, `TName`\>
