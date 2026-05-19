---
'@tanstack/ai-anthropic': minor
---

Drop `modelOptions.system` from the accepted Anthropic provider options. System prompts must now flow through the top-level `systemPrompts` option on `chat()`/`structuredOutput()`.

This was an undocumented escape hatch only reachable via casts, but it was the only way to attach `cache_control` to system blocks for prompt caching. Until `systemPrompts` is widened to carry per-prompt metadata (planned follow-up), callers who need Anthropic `cache_control` on system text should keep using `modelOptions.system` on the prior version, or supply a custom adapter override.

To make the removal loud instead of silent, the adapter now logs an `errors`-category log line via the provided `Logger` whenever unknown `modelOptions` keys are passed (including `system`). Callers casting around the public type will see the dropped keys named in the log, rather than the request going out without them.
