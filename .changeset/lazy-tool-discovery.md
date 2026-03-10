---
"@tanstack/ai": minor
---

feat: Add lazy tool discovery for `chat()`

Tools marked with `lazy: true` are not sent to the LLM upfront. Instead, a synthetic discovery tool lets the LLM selectively discover lazy tools by name, receiving their descriptions and schemas on demand. Discovered tools are dynamically injected as normal tools. This reduces token usage and improves response quality when applications have many tools.
