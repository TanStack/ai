# @tanstack/ai-zai

## 0.1.0

### Minor Changes

- Initial release of Z.AI adapter for TanStack AI
- Added Web Search tool support for Z.AI models
- Added Thinking Mode support for deep reasoning (GLM-4.7/4.6/4.5)
- Added Tool Streaming support for real-time argument streaming (GLM-4.7)
- Added subpath export for `@tanstack/ai-zai/tools` to expose `webSearchTool`
- Implemented tree-shakeable adapters:
  - Text adapter for chat/completion functionality
  - Summarization adapter for text summarization
- Features:
  - Streaming chat responses
  - Function/tool calling with automatic execution
  - Structured output with Zod schema validation through system prompts
  - OpenAI-compatible API integration
  - Full TypeScript support with per-model type inference


