---
'@tanstack/ai-sandbox-local-process': patch
---

`exec()` no longer corrupts multi-byte UTF-8 characters in `stdout` and `stderr`. A character that a pipe split across two reads used to decode as U+FFFD. Output is now decoded across chunks, like `spawn()` already does.
