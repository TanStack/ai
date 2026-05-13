export {
  type ChatCompletionFunctionTool as FunctionTool,
  convertFunctionToolToChatCompletionsFormat as convertFunctionToolToAdapterFormat,
  convertToolsToChatCompletionsFormat as convertToolsToProviderFormat,
} from '@tanstack/ai-openai-compatible'
