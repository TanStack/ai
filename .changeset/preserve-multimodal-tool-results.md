---
'@tanstack/ai': patch
---

Keep multimodal (`ContentPart[]`) server tool results as arrays on the client. The next request now sends the image to the provider, not a JSON string of it.
