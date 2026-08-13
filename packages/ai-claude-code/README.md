# @tanstack/ai-claude-code

Claude Code harness adapter for [TanStack AI](https://tanstack.com/ai) — run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (via `@anthropic-ai/claude-agent-sdk`) as a chat backend with local tool execution, stateful coding sessions, and TanStack tool bridging.

```typescript
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'

const stream = chat({
  adapter: claudeCodeText('claude-opus-4-8', {
    cwd: '/path/to/project',
    permissionMode: 'acceptEdits',
  }),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
})
```

Server-only (Node). See the [Claude Code adapter docs](https://tanstack.com/ai/latest/docs/adapters/claude-code) for sessions, tool bridging, permissions, and limitations.
