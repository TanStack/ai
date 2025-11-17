/**
 * Computer Use Tool by OpenAI
 * Allows you to control a virtual computer
 * https://platform.openai.com/docs/guides/tools-computer-use
 */
export interface ComputerUseTool {
  type: "computer_use_preview",
  display_height: number;
  display_width: number;
  environment: string;
}