# @tanstack/ai-gemini-cli

Gemini CLI harness adapter for [TanStack AI](https://tanstack.com/ai) — run [Gemini CLI](https://github.com/google-gemini/gemini-cli) (via the Agent Client Protocol) as a chat backend with local tool execution, stateful coding sessions, and TanStack tool bridging.

```typescript
import { chat } from '@tanstack/ai'
import { geminiCliText } from '@tanstack/ai-gemini-cli'

const stream = chat({
  adapter: geminiCliText('gemini-3-pro-preview', {
    cwd: '/path/to/project',
    permissionMode: 'acceptEdits',
  }),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
})
```

Server-only (Node). Requires the `gemini` CLI to be installed (`npm i -g @google/gemini-cli`) and authenticated. See the [Gemini CLI adapter docs](https://tanstack.com/ai/latest/docs/adapters/gemini-cli) for sessions, tool bridging, permissions, and limitations.
