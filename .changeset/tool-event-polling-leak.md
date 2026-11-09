---
'@tanstack/ai': patch
---

Stop a long-running server tool from leaking memory. While a tool ran, the event poll subscribed to the tool's promise again every 10 ms and kept every subscription until the tool finished. Memory grew by about 100 MB per hour while a tool stayed pending. The poll now subscribes once.
