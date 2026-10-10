---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
---

`summarize()` no longer sends a default `temperature: 0.3` when the wrapped text adapter sets `supportsSamplingTemperature: false`. The Anthropic text adapter sets that flag for models that reject non-default sampling parameters, strips `temperature` / `top_p` / `top_k` on the wire for those models, and corrects `claude-opus-5-5` provider options so sampling knobs are not typed.
