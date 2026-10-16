---
'@tanstack/ai': minor
'@tanstack/ai-persistence': patch
---

Approved edits to tool arguments stay raw until the final input check.

- `@tanstack/ai`: a resume no longer rejects approved `editedArgs` that do not fit the tool's `inputSchema`. The edit goes through `onBeforeToolCall` and the final input check, like the model's arguments. If it still does not fit, the approval is used, the tool does not run, and the model gets the input error as the tool result. The transcript keeps the approved edit as it was sent, but only when the call passed the check.
- `@tanstack/ai-persistence`: `withPersistence` binds the client-tool phase of an approved tool call to its approval. After a restart, the client result resumes with the approval that came before it, and a stale or missing approval fails the resume.
