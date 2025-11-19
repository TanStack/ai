import { CacheControl } from "../text/text-provider-options";
import type { Tool } from "@tanstack/ai";

type ComputerUseToolType = "computer_20241022" | "computer_20250124";

export interface ComputerUseTool {
  name: "computer";
  type: ComputerUseToolType;
  cache_control?: CacheControl | null
  /**
   * The height of the display in pixels.
   */
  display_height_px: number;
  /**
   * The width of the display in pixels.
   */
  display_width_px: number;
  /**
   * The X11 display number (e.g. 0, 1) for the display.
   */
  display_number: number | null;
}

export function createComputerUseTool(
  type: ComputerUseToolType,
  config: {
    displayHeightPx: number,
    displayWidthPx: number,
    displayNumber: number | null,
    cacheControl?: CacheControl | null
  }
): ComputerUseTool {
  return {
    name: "computer",
    type,
    display_height_px: config.displayHeightPx,
    display_width_px: config.displayWidthPx,
    display_number: config.displayNumber,
    cache_control: config.cacheControl || null
  };
}

export function convertComputerUseToolToAdapterFormat(tool: Tool): ComputerUseTool {
  const metadata = tool.metadata as { type: ComputerUseToolType; displayHeightPx: number; displayWidthPx: number; displayNumber: number | null; cacheControl?: CacheControl | null };
  return {
    name: "computer",
    type: metadata.type,
    display_height_px: metadata.displayHeightPx,
    display_width_px: metadata.displayWidthPx,
    display_number: metadata.displayNumber,
    cache_control: metadata.cacheControl || null,
  };
}

export function computerUseTool(type: ComputerUseToolType, config: { displayHeightPx: number; displayWidthPx: number; displayNumber: number | null; cacheControl?: CacheControl | null }): Tool {
  return {
    type: "function",
    function: {
      name: "computer",
      description: "",
      parameters: {}
    },
    metadata: {
      type,
      displayHeightPx: config.displayHeightPx,
      displayWidthPx: config.displayWidthPx,
      displayNumber: config.displayNumber,
      cacheControl: config.cacheControl
    }
  }
}