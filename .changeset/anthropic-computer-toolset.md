---
'@tanstack/ai-anthropic': minor
---

Run computer use on every Claude model that supports it.

- `computerUseTool()` takes `computer_toolset_20260801`, the only computer use version of Claude Opus 5.5, Sonnet 5.5, and Haiku 5.5. The model calls each action as its own tool. The adapter runs each call as one `computer` call with the action in `input.action`, and sends it back to Claude in the form that Claude sent. So one `execute` works for every version.
- `computerUseTool()` takes `computer_20251124`, with its `computer-use-2025-11-24` beta header.
- Each model now takes only the computer use versions that it supports. For example, `computer_20250124` on `claude-opus-4-6` is a type error, because Anthropic rejects that pair.
- `@anthropic-ai/sdk` is now `^0.135.0`.
