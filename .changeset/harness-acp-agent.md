---
'@tanstack/ai-acp': minor
---

`@tanstack/ai-acp/agent` adds `createAcpAgent` and `serveAcp`, which serve a harness as an ACP v2 agent (experimental, like the draft protocol). Tool approvals become permission requests, cancel cancels the running turn, and image, audio, and embedded file blocks go to the media store of the session. `session/list` lists the sessions of the harness from the session index of the host. The `principal` option is the user of the editor: each session opens as that user, and the list shows the sessions of that user. It is required on a host with `access`. The agent holds one session handle per ACP session. `session/close` releases it, and the close of the connection releases them all, so the host closes each session on idle. `@tanstack/ai-acp` now uses `@agentclientprotocol/sdk` 1.8, pinned to `~1.8.0` because the agent uses its experimental v2 entry point. The existing ACP client adapters keep working.
