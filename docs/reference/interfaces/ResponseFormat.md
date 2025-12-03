---
id: ResponseFormat
title: ResponseFormat
---

# Interface: ResponseFormat\<TData\>

Defined in: [types.ts:359](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L359)

Structured output format specification.

Constrains the model's output to match a specific JSON structure.
Useful for extracting structured data, form filling, or ensuring consistent response formats.

## See

 - https://platform.openai.com/docs/guides/structured-outputs
 - https://sdk.vercel.ai/docs/ai-sdk-core/structured-outputs

## Type Parameters

### TData

`TData` = `any`

TypeScript type of the expected data structure (for type safety)

## Properties

### \_\_data?

```ts
optional __data: TData;
```

Defined in: [types.ts:437](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L437)

**`Internal`**

Type-only property to carry the inferred data type.

This is never set at runtime - it only exists for TypeScript type inference.
Allows the SDK to know what type to expect when parsing the response.

***

### json\_schema?

```ts
optional json_schema: object;
```

Defined in: [types.ts:376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L376)

JSON schema specification (required when type is "json_schema").

Defines the exact structure the model's output must conform to.
OpenAI's structured outputs will guarantee the output matches this schema.

#### description?

```ts
optional description: string;
```

Optional description of what the schema represents.

Helps document the purpose of this structured output.

##### Example

```ts
"User profile information including name, email, and preferences"
```

#### name

```ts
name: string;
```

Unique name for the schema.

Used to identify the schema in logs and debugging.
Should be descriptive (e.g., "user_profile", "search_results").

#### schema

```ts
schema: Record<string, any>;
```

JSON Schema definition for the expected output structure.

Must be a valid JSON Schema (draft 2020-12 or compatible).
The model's output will be validated against this schema.

##### See

https://json-schema.org/

##### Example

```ts
{
     *   type: "object",
     *   properties: {
     *     name: { type: "string" },
     *     age: { type: "number" },
     *     email: { type: "string", format: "email" }
     *   },
     *   required: ["name", "email"],
     *   additionalProperties: false
     * }
```

#### strict?

```ts
optional strict: boolean;
```

Whether to enforce strict schema validation.

When true (recommended), the model guarantees output will match the schema exactly.
When false, the model will "best effort" match the schema.

Default: true (for providers that support it)

##### See

https://platform.openai.com/docs/guides/structured-outputs#strict-mode

***

### type

```ts
type: "json_object" | "json_schema";
```

Defined in: [types.ts:368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L368)

Type of structured output.

- "json_object": Forces the model to output valid JSON (any structure)
- "json_schema": Validates output against a provided JSON Schema (strict structure)

#### See

https://platform.openai.com/docs/api-reference/chat/create#chat-create-response_format
