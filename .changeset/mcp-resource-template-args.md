---
'@tanstack/ai-mcp': minor
---

A resource template can parse its variables. With `resourceDefinition({ uriTemplate, argsSchema })`, `argsSchema.parse` runs on the template variables before `read(uri, variables, ctx)` gets them. A read result `{ text | blob, mimeType }` sets the MIME type of that answer.
