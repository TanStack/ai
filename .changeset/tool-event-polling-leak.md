---
'@tanstack/ai': patch
---

Stop a long-running server tool from leaking memory. While a tool ran, the event poll subscribed to the tool's promise again every 10 ms and kept every subscription until the tool finished. A tool that ran for an hour held about 100 MB. The poll now subscribes once.
