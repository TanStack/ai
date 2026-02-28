---
'@tanstack/ai': patch
---

Fix chat stall when server and client tools are called in the same turn.

When the LLM requested both a server tool and a client tool in the same response, the server tool's result was silently dropped. The `processToolCalls` and `checkForPendingToolCalls` methods returned early to wait for the client tool, skipping the `emitToolResults` call entirely — so the server result was never emitted or added to the message history, causing the session to stall indefinitely.

The fix emits completed server tool results before yielding the early return for client tool / approval waiting.

Also fixes the smoke-test harness and test fixtures to use `chunk.value` instead of `chunk.data` for CUSTOM events, following the rename introduced in #307.
