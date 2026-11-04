---
'@tanstack/ai-gemini': patch
---

Native Gemini image generation no longer throws `image interaction returned no id.` when `modelOptions.store` is `false`. Gemini leaves the interaction id out of an unstored interaction, so the result gets a local id, which cannot be passed as `previous_interaction_id`. A stored interaction without an id still throws.
