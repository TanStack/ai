export interface ComputerUseTool {
  environment: "ENVIRONMENT_UNSPECIFIED" | "ENVIRONMENT_BROWSER";
  /**
   *  By default, predefined functions are included in the final model call. Some of them can be explicitly excluded from being automatically included. This can serve two purposes: 1. Using a more restricted / different action space. 2. Improving the definitions / instructions of predefined functions.
   */
  excludedPredefinedFunctions?: string[];
}

export const computerUseTool = (config?: ComputerUseTool) => {
  return {
    "computerUse": config || {}
  }
}