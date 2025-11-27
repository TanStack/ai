---
id: tool
title: tool
---

# Function: tool()

```ts
function tool<TProps, TRequired>(config): Tool;
```

Defined in: [tools/tool-utils.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-utils.ts#L70)

Helper to define a tool with enforced type safety.
Automatically infers the execute function argument types from the parameters schema.
User must provide the full Tool structure with type: "function" and function: {...}

## Type Parameters

### TProps

`TProps` *extends* `Record`\<`string`, `any`\>

### TRequired

`TRequired` *extends* readonly `string`[] \| `undefined`

## Parameters

### config

#### execute

(`args`) => `string` \| `Promise`\<`string`\>

#### function

\{
  `description`: `string`;
  `name`: `string`;
  `parameters`: \{
     `properties`: `TProps`;
     `required?`: `TRequired`;
     `type`: `"object"`;
  \};
\}

#### function.description

`string`

#### function.name

`string`

#### function.parameters

\{
  `properties`: `TProps`;
  `required?`: `TRequired`;
  `type`: `"object"`;
\}

#### function.parameters.properties

`TProps`

#### function.parameters.required?

`TRequired`

#### function.parameters.type

`"object"`

#### type

`"function"`

## Returns

[`Tool`](../../interfaces/Tool.md)

## Example

```typescript
const tools = {
  myTool: tool({
    type: "function",
    function: {
      name: "myTool",
      description: "My tool description",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The ID" },
          optional: { type: "number", description: "Optional param" },
        },
        required: ["id"],
      },
    },
    execute: async (args) => {
      // ✅ args is automatically typed as { id: string; optional?: number }
      return args.id;
    },
  }),
};
```
