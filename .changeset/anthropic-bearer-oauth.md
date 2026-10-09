---
'@tanstack/ai-anthropic': minor
---

The Anthropic adapters now accept a Bearer token and a Claude OAuth token.

- `authToken` sends `Authorization: Bearer <token>` and no `x-api-key` header.
- `apiKey` is now optional on `anthropicText`, `anthropicSummarize`, and `anthropicFiles`. Without an `apiKey` or `authToken`, the adapters read `ANTHROPIC_AUTH_TOKEN`, then `ANTHROPIC_OAUTH_TOKEN`, then `ANTHROPIC_API_KEY`.
- An `sk-ant-oat` token or `ANTHROPIC_OAUTH_TOKEN` turns on OAuth. The new `oauth` option on the text adapter turns it on or off. With OAuth, each request gets the Claude Code identity system block, the Claude Code CLI headers, and the `claude-code-20250219` and `oauth-2025-04-20` betas.

```ts
import { anthropicText } from '@tanstack/ai-anthropic'

const adapter = anthropicText('claude-sonnet-5', {
  authToken: process.env.MY_CLAUDE_OAUTH_TOKEN,
  oauth: true,
})
```
