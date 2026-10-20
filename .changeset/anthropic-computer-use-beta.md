---
'@tanstack/ai-anthropic': patch
---

Send the `anthropic-beta` header that `computerUseTool()` needs: `computer-use-2025-01-24` for `computer_20250124`, and `computer-use-2024-10-22` for `computer_20241022`. Before, a request with the tool had no computer use beta, so Anthropic rejected it.
