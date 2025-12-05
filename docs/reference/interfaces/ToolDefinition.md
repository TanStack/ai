---
id: ToolDefinition
title: ToolDefinition
---

# Interface: ToolDefinition\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L100)

Tool definition builder that allows creating server or client tools from a shared definition

## Extends

- [`ToolDefinitionInstance`](ToolDefinitionInstance.md)\<`TInput`, `TOutput`, `TName`\>

## Type Parameters

### TInput

`TInput` *extends* `z.ZodType` = `z.ZodType`

### TOutput

`TOutput` *extends* `z.ZodType` = `z.ZodType`

### TName

`TName` *extends* `string` = `string`

## Properties

### \_\_toolSide

```ts
__toolSide: "definition";
```

Defined in: [tools/tool-definition.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L48)

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`__toolSide`](ToolDefinitionInstance.md#__toolside)

***

### client()

```ts
client: <TContext>(execute?) => ClientTool<TInput, TOutput, TName, TContext>;
```

Defined in: [tools/tool-definition.ts:118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L118)

Create a client-side tool with optional execute function

#### Type Parameters

##### TContext

`TContext` = `unknown`

#### Parameters

##### execute?

(`args`, `options`) => `output`\<`TOutput`\> \| `Promise`\<`output`\<`TOutput`\>\>

#### Returns

[`ClientTool`](ClientTool.md)\<`TInput`, `TOutput`, `TName`, `TContext`\>

***

### description

```ts
description: string;
```

Defined in: [types.ts:294](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L294)

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
optional execute: <TContext>(args, options) => any;
```

Defined in: [types.ts:358](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L358)

Optional function to execute when the model calls this tool.

If provided, the SDK will automatically execute the function with the model's arguments
and feed the result back to the model. This enables autonomous tool use loops.

Can return any value - will be automatically stringified if needed.

#### Type Parameters

##### TContext

`TContext` = `unknown`

#### Parameters

##### args

`any`

The arguments parsed from the model's tool call (validated against inputSchema)

##### options

[`ToolOptions`](ToolOptions.md)\<`TContext`\>

Optional options object passed from chat() options (if provided)

#### Returns

`any`

Result to send back to the model (validated against outputSchema if provided)

#### Example

```ts
// Without context:
execute: async (args) => {
  const weather = await fetchWeather(args.location);
  return weather;
}

// With context:
execute: async (args, options) => {
  const user = await options.context.db.users.find({ id: options.context.userId });
  return user;
}
```

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`execute`](ToolDefinitionInstance.md#execute)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [types.ts:313](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L313)

Zod schema describing the tool's input parameters.

Defines the structure and types of arguments the tool accepts.
The model will generate arguments matching this schema.
The schema is converted to JSON Schema for LLM providers.

#### See

https://zod.dev/

#### Example

```ts
import { z } from 'zod';

z.object({
  location: z.string().describe("City name or coordinates"),
  unit: z.enum(["celsius", "fahrenheit"]).optional()
})
```

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`inputSchema`](ToolDefinitionInstance.md#inputschema)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L367)

Additional metadata for adapters or custom extensions

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`metadata`](ToolDefinitionInstance.md#metadata)

***

### name

```ts
name: TName;
```

Defined in: [types.ts:284](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L284)

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

Defined in: [types.ts:364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L364)

If true, tool execution requires user approval before running. Works with both server and client tools.

#### Inherited from

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`needsApproval`](ToolDefinitionInstance.md#needsapproval)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [types.ts:331](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L331)

Optional Zod schema for validating tool output.

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

[`ToolDefinitionInstance`](ToolDefinitionInstance.md).[`outputSchema`](ToolDefinitionInstance.md#outputschema)

***

### server()

```ts
server: <TContext>(execute) => ServerTool<TInput, TOutput, TName, TContext>;
```

Defined in: [tools/tool-definition.ts:108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L108)

Create a server-side tool with execute function

#### Type Parameters

##### TContext

`TContext` = `unknown`

#### Parameters

##### execute

(`args`, `options`) => `output`\<`TOutput`\> \| `Promise`\<`output`\<`TOutput`\>\>

#### Returns

[`ServerTool`](ServerTool.md)\<`TInput`, `TOutput`, `TName`, `TContext`\>
