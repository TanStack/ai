---
'@tanstack/ai-client': patch
---

fix: prevent infinite tool call loop when server tool finishes with stop

When the server-side agent loop executes a tool and the model finishes with `finishReason: 'stop'`, the client no longer auto-sends another request. Previously this caused infinite loops with non-OpenAI providers that respond minimally after tool execution.
