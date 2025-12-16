---
"@tanstack/ai-claude-agent-sdk": minor
---

feat: add Claude Agent SDK adapter for TanStack AI

This adds a new adapter package that integrates the Claude Agent SDK with TanStack AI, enabling:

- Streaming chat completions via Claude Agent SDK's agentic runtime
- Extended thinking support with configurable token budgets
- Tool integration (both custom TanStack AI tools and built-in Claude Code tools)
- Multimodal content support (images, documents)
- Full type safety with per-model provider options
- Automatic authentication via Claude Max subscription or API key
