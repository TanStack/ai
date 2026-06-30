# @tanstack/ai-antigravity-cli

Antigravity CLI harness adapter for [TanStack AI](https://tanstack.com/ai) — run [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli) (via the Agent Client Protocol) as a chat backend with local tool execution, stateful coding sessions, and TanStack tool bridging.

```typescript
import { chat } from '@tanstack/ai'
import { antigravityCliText } from '@tanstack/ai-antigravity-cli'

const stream = chat({
  adapter: antigravityCliText('gemini-3-pro-preview', {
    cwd: '/path/to/project',
    permissionMode: 'acceptEdits',
  }),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
})
```

Server-only (Node). Requires the `antigravity` CLI to be installed (`npm i -g @google/antigravity-cli`) and authenticated. See the [Antigravity CLI adapter docs](https://tanstack.com/ai/latest/docs/adapters/antigravity-cli) for sessions, tool bridging, permissions, and limitations.
