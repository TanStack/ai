export interface CustomTool {
  type: "custom"
  /**
   * The name of the custom tool.
   */
  name: string;
  /**
   * A description of the custom tool.
   */
  description?: string;
  /**
   * The input format for the custom tool. Default is unconstrained text.
   */
  format?: {
    type: "text"
  } | {
    type: "grammar"
    /**
     * The grammar definition.
     */
    definition: string
    /**
     * The syntax of the grammar definition. One of lark or regex.
     */
    syntax: string
  }
}