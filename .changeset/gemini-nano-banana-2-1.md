---
'@tanstack/ai-gemini': minor
---

Add **Nano Banana 2.1** (`gemini-nano-banana-2.1`) as a Gemini-native image model. It routes through the `generateContent` API, accepts image-conditioned prompts, and takes `aspectRatio_resolution` sizes: all 14 aspect ratios at `1K`, `2K`, or `4K` (for example `"16:9_4K"`). The `512` tier is rejected at compile time because the API does not accept it on this model.
