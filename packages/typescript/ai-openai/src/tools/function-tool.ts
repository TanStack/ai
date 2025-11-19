import type { Tool } from "@tanstack/ai";

export interface FunctionTool {
  type: "function";
  /**
   * The name of the function to call.
   */
  name: string;
  /**
   * A description of the function. Used by the model to determine whether or not to call the function.
   */
  description?: string;
  /**
   * Whether to enforce strict parameter validation.
   * @default true
   */
  strict: boolean;
  /**
   * A JSON schema object describing the parameters of the function.
   */
  parameters?: Record<string, any>;
}

/**
 * Converts a standard Tool to OpenAI FunctionTool format
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const metadata = tool.metadata as { strict?: boolean };
  return {
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    strict: metadata.strict ?? true,
    parameters: tool.function.parameters,
  };
}

/**
 * Creates a standard Tool from FunctionTool parameters
 */
export function functionTool(
  name: string,
  description: string,
  parameters: Record<string, any> = {},
  strict: boolean = true
): Tool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters,
    },
    metadata: {
      strict,
    },
  };
}