import { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

type CodeExecutionToolType = "code_execution_20250825" | "code_execution_20250522";

export interface CodeExecutionTool {
  name: "code_execution";
  type: CodeExecutionToolType;
  cache_control?: CacheControl | null
}

export function createCodeExecutionTool(type: CodeExecutionToolType, cacheControl?: CacheControl | null): CodeExecutionTool {
  return {
    name: "code_execution",
    type,
    cache_control: cacheControl || null
  };
}

export function convertCodeExecutionToolToAdapterFormat(tool: Tool): CodeExecutionTool {
  const metadata = tool.metadata as { type: CodeExecutionToolType; cacheControl?: CacheControl | null };
  return {
    name: "code_execution",
    type: metadata.type,
    cache_control: metadata.cacheControl || null,
  };
}

export function codeExecutionTool(type: CodeExecutionToolType, cacheControl?: CacheControl | null): Tool {
  return {
    type: "function",
    function: {
      name: "code_execution",
      description: "",
      parameters: {}
    },
    metadata: {
      type,
      cacheControl
    }
  }
}

