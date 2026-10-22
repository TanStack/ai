---
'@tanstack/ai-persistence': patch
---

Keep the answer of a routed agent in its own message when the turn resumes after an interrupt and a finished tool call (for example a handoff) comes before that answer. Before, the stored answer moved onto the message of the tool call.
