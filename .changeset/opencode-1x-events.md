---
'@tanstack/ai-opencode': patch
---

Support the event stream of OpenCode 1.x. An `ask` permission no longer stops a run: the adapter now answers the `permission.asked` request that OpenCode 1.x sends. The text of the agent reaches the chat again: a turn ends only after OpenCode sends `session.idle`, which comes after the last text of the turn. The text also streams again, from the `message.part.delta` events.
