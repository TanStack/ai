---
'@tanstack/ai-openai': patch
---

`openaiImage()` accepts `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`. Both take sizes `1024x1024`, `1536x1024`, `1024x1536` and `auto`, and `quality` adds `xhigh` and `max` to `low`, `medium`, `high` and `auto`. Before, both ids threw `Unknown image model` before any request was sent.
