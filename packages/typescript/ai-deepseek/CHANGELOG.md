# @tanstack/ai-deepseek

## 0.1.0

### Minor Changes

- Initial release of DeepSeek adapter for TanStack AI
- Added support for DeepSeek chat models:
  - `deepseek-chat` - Latest DeepSeek-V3 model with strong reasoning capabilities
  - `deepseek-reasoner` - Specialized reasoning model with enhanced logical thinking
  - `deepseek-coder` - Code-specialized model based on DeepSeek-Coder-V2
- Implemented tree-shakeable adapters:
  - Text adapter for chat/completion functionality
  - Summarization adapter for text summarization
  - Image adapter (placeholder - DeepSeek doesn't support image generation)
- Features:
  - Streaming chat responses
  - Function/tool calling with automatic execution
  - Structured output with Zod schema validation through system prompts
  - OpenAI-compatible API integration
  - Full TypeScript support with per-model type inference
  - Environment variable configuration (`DEEPSEEK_API_KEY`)
  - Custom base URL support for enterprise deployments
