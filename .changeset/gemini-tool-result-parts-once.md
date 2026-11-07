---
'@tanstack/ai-gemini': patch
---

Send a multimodal tool result's parts to Gemini once, inside its `functionResponse`. Before, the adapter also put them beside the `functionResponse` in the same turn, so each image was sent and billed twice.
