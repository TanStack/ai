# @tanstack/ai-codex

Codex harness adapter for [TanStack AI](https://tanstack.com/ai) — run [OpenAI Codex](https://developers.openai.com/codex) (via `@openai/codex-sdk`) as a chat backend with local tool execution, stateful coding sessions, and TanStack tool bridging.

```typescript
import { chat } from '@tanstack/ai'
import { codexText } from '@tanstack/ai-codex'

const stream = chat({
  adapter: codexText('gpt-5.1-codex', {
    cwd: '/path/to/project',
    sandboxMode: 'workspace-write',
  }),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
})
```

Server-only (Node). See the [Codex adapter docs](https://tanstack.com/ai/latest/docs/adapters/codex) for sessions, tool bridging, sandboxing, and limitations.
