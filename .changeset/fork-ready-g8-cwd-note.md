---
'@tanstack/ai-harness': patch
---

The model now hears when the working folder of a thread changes. When `session.configure()` sets a new `cwd`, or clears it with `null`, the transcript gets a short note before the next model call. The note names the new folder, or says that the default folder applies again. The same `cwd` again adds no note.
