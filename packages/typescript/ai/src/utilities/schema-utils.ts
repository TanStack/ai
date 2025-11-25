import type { ResponseFormat } from "../types";

// Type to extract TypeScript type from JSON Schema
type JSONSchemaToType<T> = T extends { type: "object"; properties: infer P }
  ? {
    [K in keyof P]: P[K] extends { type: "string" }
    ? string
    : P[K] extends { type: "number" }
    ? number
    : P[K] extends { type: "boolean" }
    ? boolean
    : P[K] extends { type: "array"; items: infer I }
    ? JSONSchemaToType<I>[]
    : any;
  }
  : T extends { type: "string" }
  ? string
  : T extends { type: "number" }
  ? number
  : T extends { type: "boolean" }
  ? boolean
  : T extends { type: "array"; items: infer I }
  ? JSONSchemaToType<I>[]
  : any;

/**
 * Helper function to create a response format with type inference
 * 
 * @example
 * ```typescript
 * const schema = responseFormat({
 *   name: "user_info",
 *   schema: {
 *     type: "object",
 *     properties: {
 *       name: { type: "string" },
 *       age: { type: "number" },
 *       email: { type: "string" }
 *     },
 *     required: ["name", "email"],
 *     additionalProperties: false
 *   }
 * });
 * 
 * const result = await chat({
 *   adapter: openai(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   responseFormat: schema
 * });
 * 
 * // result.data is typed based on the schema
 * console.log(result.data.name); // string
 * console.log(result.data.age); // number | undefined
 * ```
 */
export function responseFormat<const TSchema extends Record<string, any>>(config: {
  name: string;
  description?: string;
  schema: TSchema;
  strict?: boolean;
}): ResponseFormat<JSONSchemaToType<TSchema>> {
  return {
    type: "json_schema",
    json_schema: {
      name: config.name,
      description: config.description,
      schema: config.schema,
      strict: config.strict ?? true,
    },
  } as any;
}

/**
 * Helper function to create a flexible JSON object response format
 * 
 * @example
 * ```typescript
 * const result = await chat({
 *   adapter: openai(),
 *   model: "gpt-4o",
 *   messages: [...],
 *   responseFormat: jsonObject()
 * });
 * 
 * // result.data is typed as any (flexible JSON)
 * console.log(result.data);
 * ```
 */
export function jsonObject(): ResponseFormat<any> {
  return {
    type: "json_object",
  };
}
