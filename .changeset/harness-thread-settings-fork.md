---
'@tanstack/ai-harness': minor
---

Stored settings per thread, and a fork of a thread.

- `defineHarness({ models: { fast, strong } })` names the models a thread can pick.
- `session.configure({ model, reasoning, instructions, tools, plugins, cwd })` stores settings for the thread, from the next turn. `null` clears a field. An unknown model, plugin or bad value gets a rejected receipt. Turn `overrides` still win over the settings.
- A client can change only the fields in `defineHarness({ expose: { settings } })`. An input with another field is refused with `not_exposed`, and with no list a client can change no field. Server code that calls `session.configure()` can change every field.
- `session.settings()` reads them, `describe()` lists them with the model names, and a `harness.settings.changed` event fires on each change. Clients send `{ op: 'configure', settings }` or call `client.configure(settings)`.
- `workspaceTools` work in the thread's `cwd`, and refuse a folder outside their root.
- `host.fork(harness, { threadId, newThreadId, at?, principal? })` copies the transcript up to the message `at` into a new thread, with its stored settings, plugin config and media. It does not copy plugin state, pending interrupts, queued inputs or usage totals.
