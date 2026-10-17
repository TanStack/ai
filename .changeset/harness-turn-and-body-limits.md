---
'@tanstack/ai-harness': patch
---

Fix how a turn takes steers, settings, and plugin removals, and limit the size of client requests.

- A steer that arrives during a `session.tool()` turn waits, and then runs as its own turn. Before, the tool turn took it, did not answer it, and settled it `completed`.
- A turn keeps the config values that it started with. A config change while it runs, for example `/mode bypass`, applies from the next turn.
- `configure({ settings: { plugins: { remove } } })` removes everything that those plugins give the thread: also their agents, subagents, commands, agent and generation middleware, and the items that they add for other plugins (for example the permission rules of `agents()`). A remove that leaves a plugin without a capability that it needs is rejected.
- When two plugins give a tool with the same name from `discoverTools`, the first one stays, and clients get one `harness.plugin.warning` event that names both plugins.
- `createHarnessHandler` reads each JSON body up to `media.maxBodyBytes` (default 32 MiB). A bigger body answers 413. `handleHarnessSocket` closes the socket with code 1009 on a bigger frame.
- `POST run` moves the inline bytes of the last user message to the media store, as `POST control` does, so the transcript keeps a `harness-media:` reference. A refused part answers 413 (`media_too_large`), 415 (`media_not_allowed`), or 400 (`media_invalid`, `media_url_not_allowed`).
