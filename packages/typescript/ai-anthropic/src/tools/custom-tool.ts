import { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

export interface CustomTool {
  /**
   * The name of the tool.
   */
  name: string;
  type: "custom"
  /**
   * A brief description of what the tool does. Tool descriptions should be as detailed as possible. The more information that the model has about what the tool is and how to use it, the better it will perform. You can use natural language descriptions to reinforce important aspects of the tool input JSON schema.
   */
  description: string;
  /**
   * This defines the shape of the input that your tool accepts and that the model will produce.
   */
  input_schema: {
    type: "object";
    properties: Record<string, any> | null;
    required?: string[] | null;
  }

  cache_control?: CacheControl | null
}

export function convertCustomToolToAdapterFormat(tool: Tool): CustomTool {
  const metadata = tool.metadata as { cacheControl?: CacheControl | null };
  return {
    name: tool.function.name,
    type: "custom",
    description: tool.function.description,
    input_schema: {
      type: "object",
      properties: (tool.function.parameters as any)?.properties || null,
      required: (tool.function.parameters as any)?.required || null,
    },
    cache_control: metadata.cacheControl || null,
  };
}

export function customTool(name: string, description: string, parameters: Record<string, any>, cacheControl?: CacheControl | null): Tool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters
    },
    metadata: {
      cacheControl
    }
  }
}