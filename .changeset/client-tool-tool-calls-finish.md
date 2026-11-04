---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

Run client tools when a custom AG-UI server ends a run with `finishReason: 'tool_calls'` and closes the stream. Before, the client waited for a next run that never came, so the tool did not run and the agent loop stopped. The client now runs the unanswered calls when the stream ends. A tool that needs approval asks the user first, the same as for a success outcome.
