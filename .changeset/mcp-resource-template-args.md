---
'@tanstack/ai-mcp': minor
---

A resource with a `uriTemplate` can read the URI the host asked for. `resourceDefinition({ uriTemplate, argsSchema })` parses the template variables, and `read` gets them and the URI. A read result `{ text | blob, mimeType }` sets the MIME type of that answer.
