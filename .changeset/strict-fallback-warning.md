---
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-groq': minor
'@tanstack/ai-vercel-gateway': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-llmgateway': minor
'@tanstack/ai-lovable': minor
'@tanstack/ai-cloudflare': minor
---

Warn in development when a tool is sent with `strict: false` because its schema cannot be strict. The warning names the tool and the reason, for example `tool "lookup_user" sent with strict: false: schema uses $ref, which strict mode does not support`. It runs once per tool, never when `NODE_ENV` is `production`, and you can turn it off with `strictFallbackWarning: false` in the adapter config.
