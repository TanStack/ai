import { CacheControl } from "../text/text-provider-options";

export interface MemoryTool {
  name: "memory";
  type: "memory_20250818";
  cache_control?: CacheControl | null
}