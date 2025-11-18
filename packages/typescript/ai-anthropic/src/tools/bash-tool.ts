import { CacheControl } from "../text/text-provider-options";

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