# @tanstack/ai-opencode

OpenCode harness adapter for [TanStack AI](https://tanstack.com/ai) — run [OpenCode](https://opencode.ai) (via `@opencode-ai/sdk`) as a chat backend with local tool execution, token-level streaming, stateful sessions, and TanStack tool bridging.

```typescript
import { chat } from '@tanstack/ai'
import { opencodeText } from '@tanstack/ai-opencode'

const stream = chat({
  adapter: opencodeText('anthropic/claude-sonnet-4-5', {
    directory: '/path/to/project',
    permissionMode: 'acceptEdits',
  }),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
})
```

Server-only (Node); requires the `opencode` CLI installed and authenticated. See the [OpenCode adapter docs](https://tanstack.com/ai/latest/docs/adapters/opencode) for sessions, tool bridging, permissions, and limitations.
