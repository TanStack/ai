export interface CodeInterpreterTool {
  type: "code_interpreter",
  /**
   * The code interpreter container. Can be a container ID or an object that specifies uploaded file IDs to make available to your code.
   */
  container: string | {
    type: "auto"
    file_ids?: string[]
    memory_limit?: string
  }
}