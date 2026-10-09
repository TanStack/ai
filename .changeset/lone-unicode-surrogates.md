---
'@tanstack/ai': patch
---

`chat()` now removes lone UTF-16 surrogates from the text that it sends to the provider. This covers message text, text parts, tool results, system prompts, and the decoded strings in tool call arguments. Valid surrogate pairs, such as emoji, stay. Before this fix, a lone surrogate made the provider reject the whole request as invalid JSON or UTF-8.
