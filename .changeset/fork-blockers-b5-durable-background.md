---
'@tanstack/ai-harness': patch
---

On a durable host, the log keeps background jobs and waiting notes. When a crash stops a moved tool call or a `bash` background job, the next host adds the note "Background job <id> stopped when the host restarted." A note that waited for a busy turn comes back once after a crash.
