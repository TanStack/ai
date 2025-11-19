import { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

type BashToolType = "bash_20241022" | "bash_20250124";

export interface BashTool {
  name: "bash";
  type: BashToolType;
  cache_control?: CacheControl | null
}

export function createBashTool(type: BashToolType, cacheControl?: CacheControl | null): BashTool {
  return {
    name: "bash",
    type,
    cache_control: cacheControl || null
  };
}

export function convertBashToolToAdapterFormat(tool: Tool): BashTool {
  const metadata = tool.metadata as { type: BashToolType; cacheControl?: CacheControl | null };
  return {
    name: "bash",
    type: metadata.type,
    cache_control: metadata.cacheControl || null,
  };
}
export function bashTool(type: BashToolType, cacheControl?: CacheControl | null): Tool {
  return {
    type: "function",
    function: {
      name: "bash",
      description: "",
      parameters: {}
    },
    metadata: {
      type,
      cacheControl
    }
  }
}