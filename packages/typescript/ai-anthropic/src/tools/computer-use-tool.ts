import { CacheControl } from "../text/text-provider-options";

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