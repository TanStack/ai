import { BashTool } from "./bash-tool";
import { CodeExecutionTool } from "./code-execution-tool";
import { ComputerUseTool } from "./computer-use-tool";
import { CustomTool } from "./custom-tool";
import { MemoryTool } from "./memory-tool";
import { TextEditorTool } from "./text-editor-tool";
import { WebFetchTool } from "./web-fetch-tool";
import { WebSearchTool } from "./web-search-tool";

export type AnthropicTool = BashTool | CodeExecutionTool | ComputerUseTool | CustomTool | MemoryTool | TextEditorTool | WebFetchTool | WebSearchTool