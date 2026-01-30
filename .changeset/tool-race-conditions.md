---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

fix: improve tool execution reliability and prevent race conditions

- Fix client tool execution race conditions by tracking pending tool executions
- Prevent duplicate continuation attempts with continuationPending flag
- Guard against concurrent stream processing in streamResponse
- Add approval info to ToolCall type for server-side decision tracking
- Include approval info in model message conversion for approval workflows
- Check ModelMessage format for approval info extraction in chat activity

This change improves the reliability of tool execution, especially for:

- Client tools with async execute functions
- Approval-based tool workflows
- Sequential tool execution scenarios
