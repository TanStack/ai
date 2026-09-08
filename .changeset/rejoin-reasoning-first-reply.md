---
'@tanstack/ai-client': patch
---

Fix a `joinRun` rejoin losing the whole reply when the model reasons before it answers. The `REASONING_*` and `STEP_FINISHED` chunks that open a run already create the assistant message; the rebuild drop then ran on the later `TEXT_MESSAGE_START`, removed that message from the transcript while the processor kept its state, and every text chunk after it went to a message the UI no longer held. The transcript stayed on the user message with no reply and no `onFinish`. Those chunk types now count as rebuild triggers, so the drop runs before any assistant message exists.
