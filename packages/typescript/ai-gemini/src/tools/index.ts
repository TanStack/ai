import { CodeExecutionTool } from "./code-execution-tool";
import { ComputerUseTool } from "./computer-use-tool";
import { FileSearchTool } from "./file-search-tool";
import { FunctionDeclarationTool } from "./function-declaration-tool";
import { GoogleMapsTool } from "./google-maps-tool";
import { GoogleSearchRetrievalTool } from "./google-search-retriveal-tool";
import { GoogleSearchTool } from "./google-search-tool";
import { UrlContextTool } from "./url-context-tool";

export type GoogleGeminiTool = CodeExecutionTool | ComputerUseTool | FileSearchTool | FunctionDeclarationTool | GoogleMapsTool | GoogleSearchRetrievalTool | GoogleSearchTool | UrlContextTool;