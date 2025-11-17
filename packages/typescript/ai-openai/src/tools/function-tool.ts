export interface FunctionTool {
  type: "function";
  /**
   * The name of the function to call.
   */
  name: string;
  /**
   * A description of the function. Used by the model to determine whether or not to call the function.
   */
  description?: string;
  /**
   * Whether to enforce strict parameter validation.
   * @default true
   */
  strict: boolean;
  /**
   * A JSON schema object describing the parameters of the function.
   */
  parameters?: Record<string, any>;
}