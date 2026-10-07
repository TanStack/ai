---
'@tanstack/ai-harness': minor
---

A session can now reload its plugins while it runs. `session.reload()` waits for the running turn, cleans up the session plugins, and sets them up again from `harness.plugins()`. The transcript, the log, the thread settings, and the inbox stay. Clients get a `harness.reloaded` event. If a new `setup` throws, the session keeps working with no plugins, and the promise rejects. `host.reload(harness)` reloads every open session of that harness. The `agents()` plugin reads its folders again at each reload.

Plugins can now add and remove their own agents while the session runs, with `ctx.agents.set(agent)` and `ctx.agents.delete(name)`. A name that another plugin or the harness owns throws.
