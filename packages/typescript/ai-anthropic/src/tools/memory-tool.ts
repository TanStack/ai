import { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

export interface MemoryTool {
  name: "memory";
  type: "memory_20250818";
  cache_control?: CacheControl | null
}

export function convertMemoryToolToAdapterFormat(tool: Tool): MemoryTool {
  const metadata = tool.metadata as { cacheControl?: CacheControl | null };
  return {
    name: "memory",
    type: "memory_20250818",
    cache_control: metadata.cacheControl || null,
  };
}

export function memoryTool(cacheControl?: CacheControl | null): Tool {
  return {
    type: "function",
    function: {
      name: "memory",
      description: "",
      parameters: {}
    },
    metadata: {
      cacheControl
    }
  }
}