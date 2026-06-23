---
'@tanstack/ai-gemini': minor
---

Upgrade `@google/genai` to v2 and migrate the experimental text-interactions adapter to the SDK 2.x step-based streaming API (`step.start` / `step.delta` / `step.stop`), replacing the prior `content.*` events. Streamed function-call arguments are now accumulated from `arguments_delta` fragments and parsed leniently with `partial-json`, so an incomplete or truncated buffer keeps the last good arguments instead of resetting them and no longer logs a parse error per fragment. Exported built-in-tool CUSTOM event payloads now carry `Interactions.*Step` values, and structured output uses the polymorphic `response_format` request shape.
