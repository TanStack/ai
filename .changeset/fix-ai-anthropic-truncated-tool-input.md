---
'@tanstack/ai-anthropic': patch
---

Send `{}` as `tool_use.input` when a replayed tool call's arguments are not valid JSON. A stream that stopped mid tool call used to replay the raw string, and Anthropic rejected every later turn with "Input should be an object".
