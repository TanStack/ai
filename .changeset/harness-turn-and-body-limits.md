---
'@tanstack/ai-harness': patch
---

How a turn takes steers, settings, and plugin removals, and the size limit of client requests.

- A steer that arrives during a `session.runTool()` turn waits, and then runs as its own turn.
- A turn keeps the config values that it started with. A config change while it runs, for example `/mode bypass`, applies from the next turn.
- `configure({ settings: { plugins: { remove } } })` removes everything that those plugins give the thread: also their agents, subagents, commands, agent and generation middleware, and the items that they add for other plugins (for example the permission rules of `agents()`). A remove that leaves a plugin (of any lifetime) or a harness middleware without a capability that it needs is rejected.
- When two plugins give a tool with the same name from `discoverTools`, the first one stays, and clients get one `harness.plugin.warning` event that names both plugins.
- `createHarnessHandler` reads each JSON body up to `media.maxBodyBytes` (default 32 MiB). A bigger body answers 413. `handleHarnessSocket` closes the socket with code 1009 on a bigger frame. The WebSocket server reads the whole frame first, so also set its own frame limit (for example `maxPayload` of `ws`).
- Client media is checked part by part before any part is stored, so a refused input stores nothing. A retried input with the same `inputId` stores its media no second time, and gets the first receipt.
- A client input with a provider file handle (`source.type: 'file'`) is refused with `media_url_not_allowed` unless the harness sets `media.allowProviderFiles: true`. Server code can still send file handles.
- `POST run` moves the inline bytes of the last user message to the media store, as `POST control` does, so the transcript keeps a `harness-media:` reference. A refused part answers 413 (`media_too_large`), 415 (`media_not_allowed`), or 400 (`media_invalid`, `media_url_not_allowed`).
