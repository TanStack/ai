import type { Tool } from "../types";

/**
 * Infer TypeScript type from JSON Schema property type
 */
type InferPropertyType<T> =
  T extends { type: "string" } ? string :
  T extends { type: "number" } ? number :
  T extends { type: "boolean" } ? boolean :
  T extends { type: "array" } ? any[] :
  T extends { type: "object" } ? Record<string, any> :
  any;

/**
 * Infer argument types from parameters schema
 * Makes properties optional unless they're in the required array
 */
type InferArgs<
  TProps extends Record<string, any>,
  TRequired extends readonly string[] | undefined
> = TRequired extends readonly string[]
  ? {
    [K in keyof TProps as K extends TRequired[number] ? K : never]: InferPropertyType<TProps[K]>
  } & {
    [K in keyof TProps as K extends TRequired[number] ? never : K]?: InferPropertyType<TProps[K]>
  }
  : {
    [K in keyof TProps]?: InferPropertyType<TProps[K]>
  };

/**
 * Helper to define a tool with enforced type safety.
 * Automatically infers the execute function argument types from the parameters schema.
 * User must provide the full Tool structure with type: "function" and function: {...}
 * 
 * @example
 * ```typescript
 * const tools = {
 *   myTool: tool({
 *     type: "function",
 *     function: {
 *       name: "myTool",
 *       description: "My tool description",
 *       parameters: {
 *         type: "object",
 *         properties: {
 *           id: { type: "string", description: "The ID" },
 *           optional: { type: "number", description: "Optional param" },
 *         },
 *         required: ["id"],
 *       },
 *     },
 *     execute: async (args) => {
 *       // ✅ args is automatically typed as { id: string; optional?: number }
 *       return args.id;
 *     },
 *   }),
 * };
 * ```
 */
export function tool<
  const TProps extends Record<string, any>,
  const TRequired extends readonly string[] | undefined
>(config: {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: TProps;
      required?: TRequired;
    };
  };
  execute: (args: InferArgs<TProps, TRequired>) => Promise<string> | string;
}): Tool {
  return config as Tool;
}

/**
 * Type helper to extract tool names from a tools object
 */
export type ToolNames<T> = T extends Record<string, Tool & { __toolName: infer N }>
  ? N
  : never;

/**
 * Type helper to extract a specific tool's argument type
 */
export type ToolArgs<T extends Tool> = T extends {
  execute: (args: infer A) => any;
}
  ? A
  : never;
