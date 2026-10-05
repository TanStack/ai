---
'@tanstack/ai': patch
---

Run a tool again when the model sends no input or a literal `null` for a tool with no required fields (an empty tool_use block, issue #265). The final tool input check rejected these, so the tool did not run. Now no input is `{}`, and a `null` that the schema rejects is checked as `{}`. Other values must still fit the schema.
