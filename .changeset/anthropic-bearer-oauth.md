---
'@tanstack/ai-anthropic': minor
---

The Anthropic adapters now accept a Bearer token and a Claude OAuth token.

- The new `auth` option sets how the credential goes out: `'api-key'` (the `x-api-key` header), `'bearer'` (`Authorization: Bearer <token>`, no `x-api-key`), or `'oauth'`.
- The default is `'oauth'` when the credential contains `sk-ant-oat`, else `'api-key'`. An explicit `auth` always wins.
- `createAnthropicChat`, `createAnthropicSummarize`, and `createAnthropicFiles` use only the credential that you pass. They do not read a credential from the environment.
- `anthropicText`, `anthropicSummarize`, and `anthropicFiles` read `ANTHROPIC_AUTH_TOKEN` (`'bearer'`, or `'oauth'` for an `sk-ant-oat` token), then `ANTHROPIC_OAUTH_TOKEN` (`'oauth'`), then `ANTHROPIC_API_KEY` (`'api-key'`). They throw when none is set.
- With `'oauth'`, each request also gets the Claude Code identity system block, the Claude Code CLI headers, and the `claude-code-20250219` and `oauth-2025-04-20` betas.

```ts
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const adapter = createAnthropicChat('claude-sonnet-5-5', token, {
  auth: 'bearer',
})
```
