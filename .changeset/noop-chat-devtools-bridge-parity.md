---
'@tanstack/ai-client': patch
---

Fix `ChatClient` throwing `TypeError: this.devtoolsBridge.mountWithTools is not a function` on the first `sendMessage()` (and on `updateOptions({ tools })`) when no devtools bridge factory is supplied. The default `NoOpChatDevtoolsBridge` was missing the `mountWithTools`, `notifyToolsChanged`, and `recordStreamId` methods of the real bridge; the throw happened before the user message was appended, so the first message was silently lost. The compile-time parity check between the real and no-op bridges now fails the build when the surfaces drift.
