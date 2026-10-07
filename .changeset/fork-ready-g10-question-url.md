---
'@tanstack/ai-harness': minor
'@tanstack/ai-mcp': minor
---

A question can now have a `url`. `ctx.session.ask({ message, url })` sends the link to clients in the question event, in `snapshot().pendingQuestions`, and in the view state. The user opens the page, then answers. The session does not open the page.

`mcp()` and `mcpConnector` now ask the user when an MCP server asks for input in a tool call. A form request becomes a session question with the requested schema. A URL request becomes a question with the `url`. The answer goes back to the server. The form content is `accept`, and `{ action: 'decline' }` and `{ action: 'cancel' }` decline or cancel. The harness MCP clients now declare URL elicitation. `chat()` does not change.
