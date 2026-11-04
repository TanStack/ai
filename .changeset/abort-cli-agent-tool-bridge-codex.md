---
'@tanstack/ai-codex': patch
---

The host tool bridge now gets the run signal from `chat()`. Before, it read only `abortController`, which `chat()` does not set, so a stopped run did not abort the bridged tools.
