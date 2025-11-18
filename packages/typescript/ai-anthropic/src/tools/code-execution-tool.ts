import { CacheControl } from "../text/text-provider-options";

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

