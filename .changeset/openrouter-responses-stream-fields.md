---
'@tanstack/ai-openrouter': patch
---

Fix three gaps in the OpenRouter Responses adapter (`openRouterResponsesText`):

- Usage now has `promptTokensDetails.cachedTokens` when the response reports cached input tokens.
- An output item that the OpenRouter SDK cannot parse (the SDK gives it as `{ type: 'UNKNOWN', isUnknown: true, raw }`) is now read from its raw item, in the stream and in `structuredOutput`. Before this fix, that function call or message was lost.
- The `namespace` of a function call is now kept in the tool call metadata and sent back when the call is replayed.
