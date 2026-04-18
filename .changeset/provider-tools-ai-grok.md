---
'@tanstack/ai-grok': patch
---

Expose the `/tools` subpath and add an empty `supports.tools: []` channel per model so Grok adapters participate in the core tool-capability type gating. No provider-specific tool factories are exposed yet — define your own tools with `toolDefinition()` from `@tanstack/ai`.
