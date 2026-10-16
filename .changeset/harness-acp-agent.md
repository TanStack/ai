---
'@tanstack/ai-acp': minor
---

`@tanstack/ai-acp/agent` adds `createAcpAgent` and `serveAcp`, which serve a harness as an ACP v2 agent (experimental, like the draft protocol). Tool approvals become permission requests, cancel cancels the running turn, and image, audio, and embedded file blocks go to the media store of the session. `session/list` lists the sessions of the harness from the session index of the host. `@tanstack/ai-acp` now uses `@agentclientprotocol/sdk` 1.8, pinned to `~1.8.0` because the agent uses its experimental v2 entry point. The existing ACP client adapters keep working.
