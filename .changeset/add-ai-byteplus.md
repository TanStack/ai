---
'@tanstack/ai-byteplus': minor
---

Add `@tanstack/ai-byteplus`, an adapter package for BytePlus ModelArk: Seed
chat models, Seedance video generation, Seedream image generation, and Seed
Speech text-to-speech and transcription.

Seedance was already reachable through `@tanstack/ai-fal`, which proxies it.
This package is the direct-to-BytePlus path — BytePlus billing and rate limits,
the first-class Seedance request fields, and BytePlus's own model ids — so the
overlap is deliberate. Seed Speech is a separate BytePlus product and needs its
own API key (`BYTEPLUS_VOICE_API_KEY`), not the Ark key.
