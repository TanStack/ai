---
'@tanstack/ai': patch
---

`otelMiddleware` with `captureContent: true` now keeps multimodal parts structured in `gen_ai.input.messages` (OTel GenAI part shapes). URL media becomes a `uri` part and provider file handles become a `file` part, so traces show what the model looked at. Inline base64 data still records a `[image]`-style placeholder.
