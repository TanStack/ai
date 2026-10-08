---
'@tanstack/ai-client': patch
---

Skip the devtools bridge in production builds. `createChatDevtoolsBridge`, `createGenerationDevtoolsBridge` and `createVideoDevtoolsBridge` now return the no-op bridge when `NODE_ENV` is `production`. Before, every framework hook deep-copied the whole conversation on each streamed chunk for a devtools snapshot, even with no devtools panel open.
