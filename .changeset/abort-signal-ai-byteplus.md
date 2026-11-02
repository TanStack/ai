---
'@tanstack/ai-byteplus': patch
---

Aborting an image, video, speech, or transcription call now cancels the BytePlus request. Before, the request kept running and was billed. The image and video requests still stop at the configured `timeout`.
