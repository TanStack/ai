---
'@tanstack/ai-gemini': minor
---

- Add NanoBanana native image generation with up to 4K image output, routing all gemini-\* native image models through generateContent API
- Fix SDK property names (imageGenerationConfig → imageConfig, outputImageSize → imageSize) and rename NanoBanana types to GeminiNativeImage
- Add Gemini 3.1 Pro model support for text generation
