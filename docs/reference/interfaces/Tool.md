---
id: Tool
title: Tool
---

# Interface: Tool

Defined in: [types.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L29)

Tool/Function definition for function calling.

Tools allow the model to interact with external systems, APIs, or perform computations.
The model will decide when to call tools based on the user's request and the tool descriptions.

## See

 - https://platform.openai.com/docs/guides/function-calling
 - https://docs.anthropic.com/claude/docs/tool-use

## Properties

### execute()?

```ts
optional execute: (args) => string | Promise<string>;
```

Defined in: [types.ts:99](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L99)

Optional function to execute when the model calls this tool.

If provided, the SDK will automatically execute the function with the model's arguments
and feed the result back to the model. This enables autonomous tool use loops.

Returns the result as a string (or Promise<string>) to send back to the model.

#### Parameters

##### args

`any`

The arguments parsed from the model's tool call (matches the parameters schema)

#### Returns

`string` \| `Promise`\<`string`\>

Result string to send back to the model

#### Example

```ts
execute: async (args) => {
  const weather = await fetchWeather(args.location);
  return JSON.stringify(weather);
}
```

***

### function

```ts
function: object;
```

Defined in: [types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L40)

Function definition and metadata.

#### description

```ts
description: string;
```

Clear description of what the function does.

This is crucial - the model uses this to decide when to call the function.
Be specific about what the function does, what parameters it needs, and what it returns.

##### Example

```ts
"Get the current weather in a given location. Returns temperature, conditions, and forecast."
```

#### name

```ts
name: string;
```

Unique name of the function (used by the model to call it).

Should be descriptive and follow naming conventions (e.g., snake_case or camelCase).
Must be unique within the tools array.

##### Example

```ts
"get_weather", "search_database", "sendEmail"
```

#### parameters

```ts
parameters: Record<string, any>;
```

JSON Schema describing the function's parameters.

Defines the structure and types of arguments the function accepts.
The model will generate arguments matching this schema.

##### See

https://json-schema.org/

##### Example

```ts
{
     *   type: "object",
     *   properties: {
     *     location: { type: "string", description: "City name or coordinates" },
     *     unit: { type: "string", enum: ["celsius", "fahrenheit"] }
     *   },
     *   required: ["location"]
     * }
```

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L103)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [types.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L101)

If true, tool execution requires user approval before running. Works with both server and client tools.

***

### type

```ts
type: "function";
```

Defined in: [types.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L35)

Type of tool - currently only "function" is supported.

Future versions may support additional tool types.
