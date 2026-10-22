---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

A nested subagent that waits on an interrupt now continues after the resume under `withPersistence`. Before, it ran again from its prompt. Core rebuilds the card of the nested child from the store and takes only its id from the client card. `LoadChild` takes an optional `parentSubagentRunId`, and returns `interruptIds` and `parentToolCallId`.
