---
'@tanstack/ai-computer-use': minor
'@tanstack/ai-harness': minor
---

Add `computerUse()` in `@tanstack/ai-computer-use/harness`: computer use as a harness plugin.

- Each screenshot goes to the media store of the session. The transcript and the log keep a small `harness-media:` reference.
- The model gets only the newest `keepScreenshots` screenshots (3 by default). An older one goes to the model as a 1x1 image.
- A call with OpenAI safety checks asks the user through `permissions()`, each time. Without `permissions()`, the call is refused.
- The `plan` mode of `permissions()` refuses the `computer` tool.

`@tanstack/ai-harness` is an optional peer dependency of `@tanstack/ai-computer-use`.

A plugin can now store a file with `ctx.session.putMedia(upload)`, and put `mediaPart(record)` in a tool result.
